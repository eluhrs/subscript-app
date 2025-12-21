import os
import time
import redis
from fastapi import HTTPException, status
import logging

logger = logging.getLogger(__name__)

# Re-use the same Redis URL as Celery
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")

# Initialize Redis Client
try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
except Exception as e:
    logger.error(f"Failed to connect to Redis for Rate Limiting: {e}")
    redis_client = None

def check_rate_limit(key: str, limit: int, period: int):
    """
    Simple Sliding Window / Fixed Window hybrid using Redis.
    Increments a counter for the key. If count > limit, raises 429.
    
    :param key: Unique identifier (e.g. "login:ip:127.0.0.1")
    :param limit: Max attempts allowed
    :param period: Time window in seconds
    """
    if not redis_client:
        # Fail open if Redis is down, but log it
        logger.warning("Redis unavailable. Rate limiting disabled.")
        return

    try:
        # Create a pipeline to execute atomic operations
        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.expire(key, period)
        result = pipe.execute()
        
        count = result[0]
        
        if count > limit:
            remaining = period
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests. Please try again later."
            )
            
    except redis.RedisError as e:
        logger.error(f"Redis error during rate limit check: {e}")
        # Fail open
