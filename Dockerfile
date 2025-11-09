# you can create multistage dockerfile, my aim is not that for now

FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Make the startup script executable
RUN chmod +x ./startup.sh

# Expose the port the app runs on
EXPOSE 3000

# Start the application using the startup script
CMD ["sh", "startup.sh"]
