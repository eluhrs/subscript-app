FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (for cv2/kraken if needed) AND nano for debugging
# Install system dependencies (git required for pip install git+...)
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 nano git poppler-utils && rm -rf /var/lib/apt/lists/*

# Add alias for ls
RUN echo "alias ls='ls --color=auto'" >> /root/.bashrc

# Install backend deps (including subscript from git)
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt



# Copy Server Code (Exclude local src/subscript hacks)
COPY server /app/server
COPY config.yml /app/config.yml

# RUN pip install .  <-- REMOVED: We use requirements.txt to fetch clean subscript

WORKDIR /app

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
