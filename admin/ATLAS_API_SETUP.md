# MongoDB Atlas API Integration Setup

This document explains how to configure MongoDB Atlas API integration to get enhanced database metrics in the System Health dashboard.

## What's Added

1. **Enhanced Database Metrics**: Real-time data from MongoDB Atlas instead of estimates
2. **Cluster Information**: Atlas cluster type, version, and connection details
3. **Database Details**: Collection count, data size, and index size from Atlas
4. **Fallback System**: Works with or without Atlas API credentials

## Setup Instructions

### 1. Get MongoDB Atlas API Credentials

1. **Log in to MongoDB Atlas**: https://cloud.mongodb.com
2. **Navigate to Access Manager**:
   - Click your organization name in the top-left
   - Select "Access Manager"
3. **Create API Key**:
   - Click "API Keys" tab
   - Click "Create API Key"
   - Give it a descriptive name (e.g., "WCC-Admin-Monitoring")
   - Select **Project Owner** permissions for full access
   - Click "Create API Key"
4. **Save Your Credentials**:
   - **Public Key**: Copy this (safe to share)
   - **Private Key**: Copy this immediately (won't be shown again)

### 2. Find Your Project ID

1. In Atlas, go to your project
2. Look at the URL: `https://cloud.mongodb.com/v2/{PROJECT_ID}/...`
3. Copy the `{PROJECT_ID}` part

### 3. Configure Environment Variables

Update your `.env.development` and `.env.production` files:

```bash
# MongoDB Atlas API Configuration
ATLAS_PUBLIC_KEY=your_public_key_here
ATLAS_PRIVATE_KEY=your_private_key_here
ATLAS_PROJECT_ID=your_project_id_here
ATLAS_GROUP_ID=your_project_id_here
```

**Important**: Replace the placeholder values with your actual credentials.

### 4. Restart Your Server

After updating the environment variables, restart your Node.js server:

```bash
# For development
cd admin/server
npm start

# For production (on Render)
Render will automatically restart with new environment variables
```

## What You'll See

With Atlas API configured, you'll get:

### Enhanced Database Metrics
- **Actual disk usage** from Atlas instead of estimates
- **Real connection counts**
- **Precise data and index sizes**

### New Atlas Metrics Section
- **Cluster Information**: Type, version, connections
- **Database Information**: Collections, data size, index size
- **Real-time Updates**: Every 5 seconds with other metrics

### Fallback Behavior
If Atlas API credentials aren't configured:
- System continues to work with basic `db.stats()` metrics
- Atlas metrics section won't appear
- No errors or downtime

## Security Notes

- **Private Key**: Keep this secret and secure
- **Environment Variables**: Never commit `.env` files to git
- **Permissions**: Use minimum required permissions (Project Owner recommended for full metrics)
- **API Rate Limits**: Atlas API has rate limits, but our usage is minimal

## Troubleshooting

### Atlas Metrics Not Showing
1. Check environment variables are set correctly
2. Verify API key has Project Owner permissions
3. Ensure Project ID matches your Atlas project
4. Check server logs for Atlas API errors

### API Errors
1. Verify API credentials are correct
2. Check Atlas service status
3. Ensure your IP isn't blocked by Atlas
4. Review API key permissions

## API Endpoints Used

The system uses these Atlas API endpoints:

1. **Process Metrics**: `/groups/{groupId}/processes`
   - Gets cluster performance data
   - CPU, memory, disk usage

2. **Database Metrics**: `/groups/{groupId}/databases`
   - Gets database-specific information
   - Collection counts, sizes

## Benefits Over Basic Metrics

| Feature | Basic `db.stats()` | Atlas API |
|---------|-------------------|-----------|
| Disk Usage | Estimated | Actual |
| Connections | Local only | Real cluster |
| Data Size | Approximate | Precise |
| Index Size | Basic | Detailed |
| Cluster Info | None | Full details |
| Real-time | No | Yes |

This integration provides much more accurate and comprehensive database monitoring for your application.
