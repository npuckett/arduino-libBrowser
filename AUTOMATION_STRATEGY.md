# Arduino Library Automation Strategy

This repository uses a dual-workflow approach to keep the Arduino library database up-to-date efficiently and comprehensively.

## Workflow Overview

### 1. Daily Incremental Updates (`.github/workflows/update-libraries.yml`)
- **Schedule**: Every day at 2 AM EST (7 AM UTC)
- **Duration**: ~5-15 minutes
- **Purpose**: Capture new and recently updated libraries
- **API Usage**: Low (~200-500 calls per day)

**What it does:**
- Searches for Arduino libraries updated in the last 2 days
- Downloads library.properties files for new/updated libraries
- Adds basic GitHub metadata (stars, forks, update dates)
- Merges changes with existing dataset
- Commits only if there are actual changes

### 2. Weekly Full Enhancement (`.github/workflows/weekly-full-enhancement.yml`)
- **Schedule**: Every Sunday at 1 AM EST (6 AM UTC)
- **Duration**: ~4-6 hours
- **Purpose**: Refresh GitHub metadata for all libraries
- **API Usage**: High (~8,000+ calls per week)

**What it does:**
- Processes all libraries in the database
- Updates GitHub metadata (stars, forks, language, size, etc.)
- Handles rate limiting and errors gracefully
- Provides detailed progress tracking
- Skips libraries enhanced within the last 7 days

## Token Configuration

### Using Default GitHub Token
The workflows use `${{ secrets.GITHUB_TOKEN }}` which is automatically provided by GitHub Actions.

**Permissions needed:**
- `contents: write` (to push changes)
- `metadata: read` (to read repository information)

### Rate Limiting Strategy
- **Daily workflow**: 1 second between API calls, exponential backoff on errors
- **Weekly workflow**: 1 second between requests, 60+ seconds between batches
- **Error handling**: Retry logic with exponential backoff
- **Monitoring**: Real-time progress updates and success rate tracking

## Manual Controls

Both workflows support manual triggering via GitHub Actions UI:

### Daily Workflow
- Can be triggered manually anytime
- No parameters needed

### Weekly Workflow
- Can be triggered manually with custom parameters:
  - `batch_size`: Number of libraries to process in each batch (default: 50)
  - `delay_between_batches`: Seconds to wait between batches (default: 60)

## Efficiency Features

### Daily Workflow Optimizations
- Only processes libraries updated in last 2 days
- Tracks which libraries are new vs. updated
- Enhanced error handling and retry logic
- Meaningful commit messages with change statistics

### Weekly Workflow Optimizations
- Batch processing to manage rate limits
- Skips recently enhanced libraries (< 7 days old)
- Progress saving and detailed statistics
- Timeout protection (8-hour maximum)
- Memory-efficient processing

## Monitoring and Debugging

### Commit Messages
- **Daily**: `"Daily update: +5 new, 12 updated libraries (8,150 total) - 2025-01-15 07:30 UTC"`
- **Weekly**: `"Weekly enhancement: 8150 libraries enhanced (94.2% success) in 245min - 2025-01-15 06:45 UTC"`

### Logs and Statistics
Both workflows provide detailed console output including:
- Processing rates (libraries per minute)
- Success rates and error counts
- API call statistics
- Estimated completion times
- Memory usage and performance metrics

### Error Handling
- Repository not found (404) errors are logged but don't stop processing
- Rate limit errors trigger longer delays
- Network errors use exponential backoff
- Maximum retry limits prevent infinite loops

## Expected API Usage

### Daily Workflow
- **Search API**: ~20-100 calls per day (depending on activity)
- **Raw content**: ~50-200 calls per day (for library.properties files)
- **Total**: ~70-300 calls per day

### Weekly Workflow  
- **Repository API**: ~8,000+ calls per week (one per library)
- **Rate limit**: 5,000 calls per hour (authenticated)
- **Processing time**: 4-6 hours to stay within limits

### Monthly Totals
- **Daily workflows**: ~2,100-9,000 calls per month
- **Weekly workflows**: ~32,000+ calls per month
- **Combined**: ~35,000-40,000 calls per month
- **GitHub limit**: 180,000 calls per month (well within limits)

## Benefits of This Strategy

1. **Responsive**: New libraries appear within 24 hours
2. **Comprehensive**: All library metadata stays fresh
3. **Efficient**: Minimal redundant API calls
4. **Resilient**: Handles errors and rate limiting gracefully
5. **Transparent**: Detailed logging and statistics
6. **Maintainable**: Clear separation of concerns
7. **Cost-effective**: Well within GitHub API limits
