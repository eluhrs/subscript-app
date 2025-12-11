import os
import logging
from logging.handlers import RotatingFileHandler
from celery import Celery
from celery.signals import after_setup_logger, after_setup_task_logger

# Redis URL
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "subscript_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["server.tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# Configure Logging for Worker
LOG_DIR = "/app/logs"
LOG_FILE = os.path.join(LOG_DIR, "server.log")
os.makedirs(LOG_DIR, exist_ok=True)

def setup_log_handler(logger, log_file):
    # Check if handler already exists
    if not any(isinstance(h, RotatingFileHandler) and h.baseFilename == log_file for h in logger.handlers):
        handler = RotatingFileHandler(log_file, maxBytes=5*1024*1024, backupCount=3)
        handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)

@after_setup_logger.connect
def setup_loggers(logger, *args, **kwargs):
    setup_log_handler(logger, LOG_FILE)

@after_setup_task_logger.connect
def setup_task_loggers(logger, *args, **kwargs):
    setup_log_handler(logger, LOG_FILE)
