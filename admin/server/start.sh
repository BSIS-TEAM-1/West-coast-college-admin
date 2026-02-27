#!/bin/bash

echo " Starting West Coast College Admin Server..."

# Check if .env file exists
if [ ! -f ".env.production" ]; then
    echo ".env.production file not found!"
    echo "Please create .env.production with your MongoDB URI and JWT_SECRET"
    exit 1
fi

# Load environment variables
export $(cat .env.production | grep -v '^#' | xargs)

echo " Environment loaded"
echo " MongoDB URI: ${MONGODB_URI:0:50}..."
echo " Server will start on port ${PORT:-3001}"

# Start the server
echo " Starting server..."
npm start
