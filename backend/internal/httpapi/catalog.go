package httpapi

import (
	"errors"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type category struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type dishInput struct {
	CategoryID  int64    `json:"category_id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Ingredients string   `json:"ingredients"`
	Price       string   `json:"price"`
	Portion     *string  `json:"portion"`
	Unit        *string  `json:"unit"`
	Aliases     []string `json:"aliases"`
}

type dish struct {
	dishInput
	ID    int64   `json:"id"`
	Photo *string `json:"photo"`
}

const dishColumns = `d.id,d.category_id,d.name,d.description,d.ingredients,d.price::text,d.portion_value::text,d.portion_unit,d.image_key,
    ARRAY(SELECT alias FROM dish_alias WHERE dish_id=d.id ORDER BY alias)`

func readDish(row pgx.CollectableRow) (dish, error) {
	var d dish
	err := row.Scan(&d.ID, &d.CategoryID, &d.Name, &d.Description, &d.Ingredients, &d.Price, &d.Portion, &d.Unit, &d.Photo, &d.Aliases)
	if d.Photo != nil {
		*d.Photo = "/api/v1/photos/" + *d.Photo
	}
	return d, err
}

func (s server) catalogRoutes(m *http.ServeMux) {
	m.HandleFunc("GET /api/v1/categories", s.categories)
	m.HandleFunc("GET /api/v1/dishes", s.dishes)
	m.HandleFunc("GET /api/v1/dishes/{id}", s.dish)
	m.HandleFunc("GET /api/v1/photos/{key}", s.photo)
	m.HandleFunc("POST /api/v1/admin/categories", s.saveCategory)
	m.HandleFunc("PUT /api/v1/admin/categories/{id}", s.saveCategory)
	m.HandleFunc("POST /api/v1/admin/dishes", s.saveDish)
	m.HandleFunc("PUT /api/v1/admin/dishes/{id}", s.saveDish)
	m.HandleFunc("PUT /api/v1/admin/dishes/{id}/photo", s.changePhoto)
	m.HandleFunc("DELETE /api/v1/admin/dishes/{id}/photo", s.changePhoto)
}

func pageNumber(w http.ResponseWriter, r *http.Request) (int, bool) {
	value := r.URL.Query().Get("page")
	if value == "" {
		return 1, true
	}
	page, err := strconv.Atoi(value)
	if err != nil || page < 1 || page > 10000 {
		fail(w, 400, "Неверный номер страницы")
		return 0, false
	}
	return page, true
}

func pageReply[T any](w http.ResponseWriter, items []T) {
	more := len(items) > 20
	if more {
		items = items[:20]
	}
	if items == nil {
		items = []T{}
	}
	reply(w, 200, struct {
		Items   []T  `json:"items"`
		HasMore bool `json:"has_more"`
	}{items, more})
}

func (s server) categories(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), "SELECT id,name FROM category ORDER BY name,id")
	if err != nil {
		internal(w, err)
		return
	}
	result, err := pgx.CollectRows(rows, pgx.RowToStructByPos[category])
	if err != nil {
		internal(w, err)
		return
	}
	if result == nil {
		result = []category{}
	}
	reply(w, 200, result)
}

func (s server) dishes(w http.ResponseWriter, r *http.Request) {
	page, ok := pageNumber(w, r)
	if !ok {
		return
	}
	q := clean(r.URL.Query().Get("q"))
	var categoryID int64
	if raw := r.URL.Query().Get("category"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || id <= 0 {
			fail(w, 400, "Неверная категория")
			return
		}
		categoryID = id
	}
	if utf8.RuneCountInString(q) > 120 || strings.ContainsRune(q, 0) {
		fail(w, 400, "Неверный запрос поиска")
		return
	}
	rows, err := s.db.Query(r.Context(), "SELECT "+dishColumns+` FROM dish d
        WHERE ($1=0 OR d.category_id=$1) AND strpos(lower(d.name),lower($2))>0
        ORDER BY d.name,d.id LIMIT 21 OFFSET $3`, categoryID, q, (page-1)*20)
	if err != nil {
		internal(w, err)
		return
	}
	result, err := pgx.CollectRows(rows, readDish)
	if err != nil {
		internal(w, err)
		return
	}
	pageReply(w, result)
}

func (s server) dish(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), "SELECT "+dishColumns+" FROM dish d WHERE d.id=$1", id)
	if err != nil {
		internal(w, err)
		return
	}
	d, err := pgx.CollectOneRow(rows, readDish)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Блюдо не найдено")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	reply(w, 200, d)
}

func catalogError(w http.ResponseWriter, err error) {
	var pgerr *pgconn.PgError
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		fail(w, 404, "Запись не найдена")
	case errors.As(err, &pgerr) && pgerr.Code == "23505":
		fail(w, 409, "Такое название уже есть")
	case errors.As(err, &pgerr) && pgerr.Code == "23503":
		fail(w, 400, "Выберите существующую категорию")
	default:
		internal(w, err)
	}
}

func (s server) saveCategory(w http.ResponseWriter, r *http.Request) {
	u, ok := s.require(w, r, true)
	if !ok {
		return
	}
	var in struct{ Name string }
	if !decode(w, r, &in) {
		return
	}
	in.Name = clean(in.Name)
	if !validText(in.Name, 80) {
		fail(w, 400, "Укажите название категории до 80 символов")
		return
	}
	var id int64
	if r.Method == "PUT" {
		id, ok = pathID(w, r)
		if !ok {
			return
		}
	}
	ctx := r.Context()
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		action := "category.update"
		if r.Method == "POST" {
			action = "category.create"
			if err := tx.QueryRow(ctx, "INSERT INTO category(name) VALUES ($1) RETURNING id", in.Name).Scan(&id); err != nil {
				return err
			}
		} else {
			if err := tx.QueryRow(ctx, "UPDATE category SET name=$2 WHERE id=$1 RETURNING id", id, in.Name).Scan(&id); err != nil {
				return err
			}
		}
		return event(r, tx, u.ID, action, "category", id, nil)
	})
	if err != nil {
		catalogError(w, err)
		return
	}
	reply(w, 200, category{id, in.Name})
}

var priceFormat = regexp.MustCompile(`^[0-9]{1,8}(\.[0-9]{1,2})?$`)
var portionFormat = regexp.MustCompile(`^[0-9]{1,6}(\.[0-9]{1,2})?$`)

func validText(value string, max int) bool {
	return value != "" && !strings.ContainsRune(value, 0) && utf8.RuneCountInString(value) <= max
}

func (in *dishInput) validate() string {
	in.Name = clean(in.Name)
	if in.CategoryID <= 0 || !validText(in.Name, 120) {
		return "Укажите категорию и название блюда"
	}
	if len(in.Description) > 6000 || len(in.Ingredients) > 6000 || strings.ContainsRune(in.Description+in.Ingredients, 0) {
		return "Проверьте описание и состав блюда"
	}
	if !priceFormat.MatchString(in.Price) {
		return "Укажите неотрицательную цену с точностью до двух знаков"
	}
	if in.Portion != nil && in.Unit != nil {
		amount, _ := strconv.ParseFloat(*in.Portion, 64)
		if !portionFormat.MatchString(*in.Portion) || amount <= 0 || (*in.Unit != "g" && *in.Unit != "ml") {
			return "Укажите положительный размер порции в граммах или миллилитрах"
		}
	} else if in.Portion != nil || in.Unit != nil {
		return "Укажите размер и единицу порции вместе"
	}
	if len(in.Aliases) > 20 {
		return "Допускается до 20 вариантов названия"
	}
	for i, alias := range in.Aliases {
		in.Aliases[i] = strings.ToLower(clean(alias))
		if !validText(in.Aliases[i], 120) {
			return "Проверьте варианты названия"
		}
	}
	slices.Sort(in.Aliases)
	in.Aliases = slices.Compact(in.Aliases)
	return ""
}

func (s server) saveDish(w http.ResponseWriter, r *http.Request) {
	u, ok := s.require(w, r, true)
	if !ok {
		return
	}
	var in dishInput
	if !decode(w, r, &in) {
		return
	}
	if message := in.validate(); message != "" {
		fail(w, 400, message)
		return
	}
	var id int64
	if r.Method == "PUT" {
		id, ok = pathID(w, r)
		if !ok {
			return
		}
	}
	ctx := r.Context()
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		args := []any{in.CategoryID, in.Name, in.Description, in.Ingredients, in.Price, in.Portion, in.Unit}
		action := "dish.update"
		if r.Method == "POST" {
			action = "dish.create"
			if err := tx.QueryRow(ctx, `INSERT INTO dish(category_id,name,description,ingredients,price,portion_value,portion_unit)
                VALUES($1,$2,$3,$4,$5::text::numeric,$6::text::numeric,$7) RETURNING id`, args...).Scan(&id); err != nil {
				return err
			}
		} else {
			if err := tx.QueryRow(ctx, `UPDATE dish SET category_id=$1,name=$2,description=$3,ingredients=$4,price=$5::text::numeric,
                portion_value=$6::text::numeric,portion_unit=$7 WHERE id=$8 RETURNING id`, append(args, id)...).Scan(&id); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, "DELETE FROM dish_alias WHERE dish_id=$1", id); err != nil {
				return err
			}
		}
		if len(in.Aliases) > 0 {
			if _, err := tx.Exec(ctx, "INSERT INTO dish_alias SELECT $1,unnest($2::text[])", id, in.Aliases); err != nil {
				return err
			}
		}
		return event(r, tx, u.ID, action, "dish", id, nil)
	})
	if err != nil {
		catalogError(w, err)
		return
	}
	reply(w, 200, map[string]int64{"id": id})
}
