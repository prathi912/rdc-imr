# Secure Deployment script for R&D Portal
# This script reads environment variables from your local .env file
# and passes them securely to Google Cloud Build.

if (-not (Test-Path .env)) {
    Write-Host "Error: .env file not found!" -ForegroundColor Red
    exit 1
}

Write-Host "Reading configuration from .env..." -ForegroundColor Cyan

# Load .env file content
$envVars = @{}
Get-Content .env | ForEach-Object {
    if ($_ -match "^\s*([\w_]+)\s*=\s*(.*)") {
        $key = $Matches[1]
        $val = $Matches[2].Trim().Trim('"').Trim("'")
        $envVars[$key] = $val
    }
}

# Define the variables needed for Cloud Build
# We prefix them with _ to match the substitutions in cloudbuild.yaml
$subList = @()
$keysToPass = @(
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_API",
    "NEXT_PUBLIC_BASE_URL",
    "NEXT_PUBLIC_FIREBASE_DATABASE_URL",
    "GEMINI_API_KEY",
    "GENERATIVE_AI_API_KEY",
    "WOS_API_KEY",
    "SPRINGER_API_KEY",
    "SCOPUS_API_KEY",
    "FIREBASE_PRIVATE_KEY"
)

foreach ($key in $keysToPass) {
    if ($envVars.ContainsKey($key)) {
        $val = $envVars[$key]
        # Escape newlines for the private key (required by Cloud Build)
        $val = $val -replace "\r?\n", "\n"
        $subList += "_$key=$val"
    } else {
        Write-Host "Warning: $key not found in .env" -ForegroundColor Yellow
    }
}

$subs = $subList -join ","

Write-Host "Initiating Cloud Build..." -ForegroundColor Cyan
# Run the build command
gcloud builds submit --config cloudbuild.yaml --substitutions=$subs
