#Requires -Version 7.0

<#
.SYNOPSIS
    Test script to validate the library data generation approach with a small sample.

.DESCRIPTION
    Tests the library.properties fetching logic with the first 10 repositories
    to ensure the approach works before running the full script.
#>

param(
    [int]$SampleSize = 10
)

# Import functions from the main script
. ".\Generate-LibraryData.ps1" -InputFile "dummy" -WhatIf 2>$null

Write-Host "Arduino Library Data Generator - Test Mode" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

# Read first few repositories
$repositories = Get-Content "input/repositories.txt" | Select-Object -First $SampleSize

Write-Host "Testing with first $SampleSize repositories..." -ForegroundColor Yellow

$testResults = @()
$successCount = 0

foreach ($repoUrl in $repositories) {
    $repoUrl = $repoUrl.Trim()
    if ([string]::IsNullOrWhiteSpace($repoUrl)) { continue }
    
    $repoName = ($repoUrl -replace '\.git$', '' -split '/')[-2..-1] -join '/'
    Write-Host "Testing: $repoName" -ForegroundColor Cyan
    
    try {
        # Convert to raw URL
        $rawUrl = $repoUrl -replace 'github\.com', 'raw.githubusercontent.com'
        $rawUrl = $rawUrl -replace '\.git$', ''
        if (!$rawUrl.EndsWith('/')) { $rawUrl += '/' }
        
        # Try main branch first
        $propertiesUrl = $rawUrl + "main/library.properties"
        $response = $null
        
        try {
            $response = Invoke-RestMethod -Uri $propertiesUrl -TimeoutSec 10 -ErrorAction Stop
            $branch = "main"
        }
        catch {
            # Try master branch
            $propertiesUrl = $rawUrl + "master/library.properties"
            $response = Invoke-RestMethod -Uri $propertiesUrl -TimeoutSec 10 -ErrorAction Stop
            $branch = "master"
        }
        
        if ($response) {
            # Parse properties
            $properties = @{}
            $lines = $response -split "`n"
            foreach ($line in $lines) {
                $line = $line.Trim()
                if ($line -and !$line.StartsWith('#') -and $line -match '^([^=]+)=(.*)$') {
                    $key = $matches[1].Trim()
                    $value = $matches[2].Trim()
                    $properties[$key] = $value
                }
            }
            
            $result = @{
                repository = $repoName
                success = $true
                branch = $branch
                properties_count = $properties.Count
                name = $properties.name ?? "N/A"
                version = $properties.version ?? "N/A"
                author = $properties.author ?? "N/A"
                category = $properties.category ?? "N/A"
            }
            
            $testResults += $result
            $successCount++
            
            Write-Host "  ✓ Success - Name: $($result.name), Version: $($result.version)" -ForegroundColor Green
        }
    }
    catch {
        $result = @{
            repository = $repoName
            success = $false
            error = $_.Exception.Message
        }
        $testResults += $result
        Write-Host "  ✗ Failed - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nTest Results Summary:" -ForegroundColor Yellow
Write-Host "====================" -ForegroundColor Yellow
Write-Host "Total tested: $SampleSize" -ForegroundColor White
Write-Host "Successful: $successCount" -ForegroundColor Green
Write-Host "Failed: $($SampleSize - $successCount)" -ForegroundColor Red
Write-Host "Success rate: $([Math]::Round(($successCount / $SampleSize) * 100, 1))%" -ForegroundColor Cyan

if ($successCount -gt 0) {
    Write-Host "`nSample Libraries Found:" -ForegroundColor Cyan
    $testResults | Where-Object { $_.success } | ForEach-Object {
        Write-Host "  - $($_.name) ($($_.version)) by $($_.author)" -ForegroundColor White
    }
    
    Write-Host "`nThe approach looks good! You can now run the full script:" -ForegroundColor Green
    Write-Host ".\Generate-LibraryData.ps1" -ForegroundColor Yellow
}
else {
    Write-Host "`nNo libraries were successfully processed. Please check:" -ForegroundColor Red
    Write-Host "  - Internet connection" -ForegroundColor White
    Write-Host "  - GitHub repository accessibility" -ForegroundColor White
    Write-Host "  - PowerShell version (requires 7.0+)" -ForegroundColor White
}
