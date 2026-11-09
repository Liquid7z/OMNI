# Production Dockerfile for OMNI Universal Downloader
FROM node:20-alpine

# Install Python, FFmpeg, and yt-dlp dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    curl \
    ca-certificates

# Install latest yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy application files
COPY package.json ./
COPY server.mjs ./
COPY index.html ./
COPY styles.css ./
COPY app.js ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.mjs"]

