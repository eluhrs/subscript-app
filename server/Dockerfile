FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (for cv2/kraken if needed)
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

# Install backend deps
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install subscript package
COPY . /app
RUN pip install .

WORKDIR /app

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
