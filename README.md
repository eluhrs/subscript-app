# Subscript App

A web interface for the Subscript HTR pipeline.

## Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/eluhrs/subscript-app.git
    cd subscript-app
    ```

2.  **Create configuration:**
    Copy the example environment file:
    ```bash
    cp .env.example .env  # Or create .env manually
    ```
    *(Ensure you set your API keys in `.env`)*

3.  **Initialize Database File:**
    Docker requires the database file to exist on the host before mounting.
    ```bash
    touch subscript.db
    ```

4.  **Create Documents Directory:**
    ```bash
    mkdir documents
    ```

5.  **Run with Docker:**
    ```bash
    docker compose up -d --build
    ```

## Usage

*   **Web Interface:** [http://localhost:8080](http://localhost:8080)
*   **API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
