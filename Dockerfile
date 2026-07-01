FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    nmap \
    gcc \
    iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app files
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY config/ ./config/

EXPOSE 7777

CMD ["sh", "-c", "cd /app/backend && uvicorn main:app --host 0.0.0.0 --port 7777"]
