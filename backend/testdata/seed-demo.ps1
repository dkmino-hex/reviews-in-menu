$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
$project = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$photos = [ordered]@{ A='pasta'; B='soup'; C='tea'; D='cutlets'; E='salad'; F='syrniki' }

Push-Location -LiteralPath $project
try {
    foreach ($entry in $photos.GetEnumerator()) {
        $file = Join-Path $PSScriptRoot "photos/$($entry.Value).jpeg"
        $key = 'DEMOMENUPHOTO'.PadRight(25, 'A') + $entry.Key + '.jpeg'
        docker compose cp $file "api:/photos/$key"
        if ($LASTEXITCODE -ne 0) { throw "Не удалось загрузить $file" }
    }
    foreach ($fixture in 'menu.sql', 'analytics-demo.sql') {
        Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot $fixture) |
            docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U reviews -d reviews
        if ($LASTEXITCODE -ne 0) { throw "Не удалось применить $fixture" }
    }
}
finally {
    Pop-Location
}
