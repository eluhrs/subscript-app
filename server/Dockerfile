FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (for cv2/kraken if needed) AND nano for debugging
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 nano && rm -rf /var/lib/apt/lists/*

# Add alias for ls
RUN echo "alias ls='ls --color=auto'" >> /root/.bashrc

# Install backend deps
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install subscript package
COPY . /app
RUN pip install .

WORKDIR /app

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
