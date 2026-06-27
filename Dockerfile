FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    nmap \
    iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app files
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY config/ ./config/

EXPOSE 3000

CMD ["python", "backend/main.py"]
