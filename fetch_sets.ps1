$ErrorActionPreference = "Stop"
$outDir = "C:\Users\vivek\.gemini\antigravity\scratch\tcgp-deck-builder\data"

if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

function Map-Rarity {
    param([string]$RarityStr)
    switch ($RarityStr) {
        "One Diamond"   { return "◇" }
        "Two Diamond"   { return "◇◇" }
        "Three Diamond" { return "◇◇◇" }
        "Four Diamond"  { return "◇◇◇◇" }
        "One Star"      { return "☆" }
        "Two Star"      { return "☆☆" }
        "Three Star"    { return "☆☆☆" }
        "Crown"         { return "👑" }
        "None"          { return "" }
        default         { return $RarityStr }
    }
}

function Fetch-Set {
    param([string]$SetId, [string]$SetName)
    Write-Host "Fetching set: $SetId..."
    
    $headers = @{ "User-Agent" = "PowerShell/1.0" }
    
    try {
        $setData = Invoke-RestMethod -Uri "https://api.tcgdex.net/v2/en/sets/$SetId" -Headers $headers
    } catch {
        Write-Host "Failed to list set $SetId"
        return @()
    }
    
    $setCards = @()
    $count = 0
    $total = $setData.cards.Length

    foreach ($shortCard in $setData.cards) {
        $cId = $shortCard.id
        try {
            $detail = Invoke-RestMethod -Uri "https://api.tcgdex.net/v2/en/cards/$cId" -Headers $headers
        } catch {
            Write-Host "Failed to fetch card $cId"
            continue
        }
        
        $numPart = $cId.Split('-')[1]
        
        $rarityVal = ""
        if ($null -ne $detail.rarity) { $rarityVal = $detail.rarity }
        $rarity = Map-Rarity $rarityVal
        
        $type = "Colorless"
        if ($null -ne $detail.types -and $detail.types.length -gt 0) { $type = $detail.types[0] }
        elseif ($detail.category -eq 'Trainer' -and $null -ne $detail.trainerType) { $type = $detail.trainerType }

        $hp = 0
        if ($null -ne $detail.hp) { $hp = [int]$detail.hp }
        
        $stage = "Basic"
        if ($null -ne $detail.stage) { $stage = $detail.stage }
        elseif ($detail.category -eq 'Trainer') { $stage = "Trainer" }
        
        $weakness = ""
        if ($null -ne $detail.weaknesses -and $detail.weaknesses.Length -gt 0) { $weakness = $detail.weaknesses[0].type }
        
        $retreatCost = 0
        if ($null -ne $detail.retreat) { $retreatCost = [int]$detail.retreat }

        $cardObj = [ordered]@{
            id = $cId;
            name = $detail.name;
            set = $SetName;
            setCode = $SetId;
            rarity = $rarity;
            type = $type;
            hp = $hp;
            stage = $stage;
            weakness = $weakness;
            retreatCost = $retreatCost;
            img = "https://assets.tcgdex.net/en/tcgp/$SetId/$numPart/high.webp"
        }
        $setCards += $cardObj
        
        $count++
        if ($count % 50 -eq 0 -or $count -eq $total) {
            Write-Host "Fetched $count / $total"
        }
    }
    return $setCards
}

$allSets = @(
    @("A1", "Genetic Apex"),
    @("A1a", "Mythical Island"),
    @("A2", "Space-Time Smackdown"),
    @("A2a", "Triumphant Light"),
    @("A2b", "Shining Revelry"),
    @("A3", "Celestial Guardians"),
    @("A3a", "Extradimensional Crisis"),
    @("A3b", "Eevee Grove"),
    @("A4", "Wisdom of Sea and Sky"),
    @("A4a", "Secluded Springs"),
    @("B1", "Mega Rising"),
    @("B1a", "Crimson Blaze"),
    @("B2", "Fantastical Parade"),
    @("B2a", "Paldean Wonders"),
    @("P-A", "Promo-A")
)

$masterCardList = @()

foreach ($set in $allSets) {
    $cards = Fetch-Set $set[0] $set[1]
    $masterCardList += $cards
}

$jsonOutput = $masterCardList | ConvertTo-Json -Depth 10 -Compress
$outPath = Join-Path $outDir 'all_cards.json'
[IO.File]::WriteAllText($outPath, $jsonOutput, [System.Text.Encoding]::UTF8)

Write-Host "Saved all_cards.json"
Write-Host "DONE"
