# Microservices Data Analytics Application

This application consists of several microservices that work together to authenticate users, enter data, and show analytics results.

## Services

1. Authentication Service (Port 8000)
2. Enter Data Service (Port 8001)
3. Show Results Service (Port 8002)
4. Analytics Service (Internal)
5. MySQL Database
6. MongoDB Database

## Building and Running

To build and run the application:

```bash
docker-compose up --build
```

## Testing the Services

### 1. Authentication Service

The authentication service validates user credentials and is used internally by other services..

#### User 1:

```bash
curl -X POST http://localhost:8000/validate \
-H "Content-Type: application/json" \
-d '{"userid": "user1", "password": "password1"}'
```

Expected output:

```json
{"message":"Authentication successful","userid":"user1"}
```

### 2. Enter Data Service

The enter data service allows authenticated users to input numerical data.

Access the GUI at: http://localhost:8001

You can also use the API directly:

```bash
curl -X POST http://localhost:8001/enter-data \
-H "Content-Type: application/json" \
-d '{"userid": "user1", "password": "password1", "value": 42.5}'
```

Expected output:

```json
{"message":"Data entered successfully"}
```

### 3. Show Results Service

The show results service displays analytics results for authenticated users.

Access the GUI at: http://localhost:8002

You can also use the API directly:

```bash
curl -X POST http://localhost:8002/results \
-H "Content-Type: application/json" \
-d '{"userid": "user1", "password": "password1"}'
```

Example output:

```json
[
    {
        "userid": "user1",
        "max": 42.5,
        "min": 42.5,
        "avg": 42.5,
        "count": 1
    }
]
```

## Notes

- The analytics service runs periodically to calculate statistics for each user's data.
- Results shown are examples and may vary based on the actual data entered.
- In a production environment, ensure proper security measures are implemented, including secure password storage and HTTPS.
