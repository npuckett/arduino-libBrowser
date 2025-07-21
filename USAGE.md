# Arduino Library Browser - Data Generation

This PowerShell script processes all Arduino libraries from the GitHub registry and generates a comprehensive JSON file containing library metadata.

## Features

- **Parallel Processing**: Processes multiple repositories concurrently for speed
- **Resume Capability**: Can resume from where it left off if interrupted
- **Rate Limiting**: Built-in delays to avoid GitHub API limits
- **Error Handling**: Skips repositories with missing library.properties files
- **Progress Tracking**: Shows real-time progress during processing
- **Comprehensive Data**: Extracts all library.properties fields plus metadata

## Usage

### Basic Usage
```powershell
.\Generate-LibraryData.ps1
```

### Custom Parameters
```powershell
.\Generate-LibraryData.ps1 -MaxParallelJobs 20 -BatchSize 100 -DelayBetweenBatches 1
```

### Resume Interrupted Processing
If the script is interrupted, simply run it again - it will automatically resume from where it left off.

## Parameters

- **InputFile**: Path to repositories.txt (default: "input/repositories.txt")
- **OutputFile**: Path for output JSON (default: "output/libraries.json") 
- **MaxParallelJobs**: Concurrent processing limit (default: 10)
- **DelayBetweenBatches**: Seconds between batches (default: 2)
- **BatchSize**: Repositories per batch (default: 50)
- **ResumeFile**: Progress tracking file (default: "temp/progress.json")

## Output Format

The generated JSON contains:
- Library metadata (name, version, author, etc.)
- Repository information
- Processing timestamps
- All library.properties fields
- Summary statistics

## Performance

With 8,247 repositories:
- Estimated runtime: 2-4 hours (depending on network and GitHub response times)
- Memory usage: Moderate (processes in batches)
- Network: ~25-50 MB of data downloaded

## Error Handling

The script will:
- Skip repositories without library.properties files
- Retry with 'master' branch if 'main' branch fails
- Log warnings for failed repositories
- Continue processing even if individual repositories fail

## Resuming

If interrupted, the script saves progress to `temp/progress.json`. When restarted, it will:
- Load previously processed libraries
- Continue from the last completed batch
- Avoid re-processing already completed repositories
