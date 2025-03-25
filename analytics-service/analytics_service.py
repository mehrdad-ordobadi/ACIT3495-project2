import os
import time
import mysql.connector
from flask import Flask, jsonify
from pymongo import MongoClient
from mysql.connector import Error
import re

app = Flask(__name__)

def get_mysql_connection():
    return mysql.connector.connect(
        host=os.environ.get('MYSQL_HOST', 'mysql'),
        user=os.environ.get('MYSQL_USER', 'reader'),
        password=os.environ.get('MYSQL_PASSWORD', 'readerpassword'),
        database=os.environ.get('MYSQL_DATABASE', 'datadb')
    )


def get_mongodb_connection():
    mongo_host = os.environ.get('MONGO_HOST', 'mongodb')
    mongo_user = os.environ.get('MONGO_USER_WRITER', 'writer')
    mongo_password = os.environ.get('MONGO_PASSWORD_WRITER', 'writerpassword')
    mongo_database = os.environ.get('MONGO_DATABASE', 'analyticsdb')

    mongo_uri = f'mongodb://{mongo_user}:{mongo_password}@{mongo_host}:27017/{mongo_database}?authSource={mongo_database}'
    return MongoClient(mongo_uri)

def mask_password(uri):
    """Helper function to mask passwords in URIs"""
    return re.sub(r':([^:@]+)@', ':****@', uri)

@app.route('/health')
def health_check():
    """Basic health check endpoint"""
    return jsonify({"status": "healthy"})

@app.route('/health/ready')
def ready_check():
    """Readiness probe that checks database connections"""
    status = {"status": "ready", "checks": {}}
    try:
        # Test MySQL connection
        mysql_conn = get_mysql_connection()
        cursor = mysql_conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchall()  # Using fetchall() as it's more thorough
        cursor.close()
        mysql_conn.close()
        status["checks"]["mysql"] = "connected"
    except Exception as e:
        status["status"] = "not ready"
        status["checks"]["mysql"] = str(e)

    try:
        # Test MongoDB connection
        mongo_client = get_mongodb_connection()
        mongo_client.admin.command('ping')
        mongo_client.close()
        status["checks"]["mongodb"] = "connected"
    except Exception as e:
        status["status"] = "not ready"
        status["checks"]["mongodb"] = str(e)

    if status["status"] == "ready":
        return jsonify(status), 200
    return jsonify(status), 503

@app.route('/service-info')
def service_info():
    mongo_uri = os.environ.get('MONGO_URI', 'mongodb://mongodb:27017/analyticsdb')
    return jsonify({
        "name": "analytics-service",
        "version": "1.0.0",
        "endpoints": [
            {
                "path": "/health",
                "method": "GET",
                "description": "Liveness probe"
            },
            {
                "path": "/health/ready",
                "method": "GET",
                "description": "Readiness probe"
            },
            {
                "path": "/service-info",
                "method": "GET",
                "description": "Service discovery information"
            }
        ],
        "dependencies": {
            "mongodb": {
                "uri": mask_password(mongo_uri)
            },
            "mysql": {
                "host": os.environ.get('MYSQL_HOST', 'mysql'),
                "database": os.environ.get('MYSQL_DATABASE', 'datadb')
            }
        }
    })

def calculate_analytics():
    """Calculate analytics from MySQL data and store in MongoDB"""
    try:
        mysql_conn = get_mysql_connection()
        cursor = mysql_conn.cursor()
        
        cursor.execute("SELECT userid, value FROM data")
        results = cursor.fetchall()
        
        analytics = {}
        for userid, value in results:
            if userid not in analytics:
                analytics[userid] = {"values": []}
            analytics[userid]["values"].append(value)
        
        for userid, data in analytics.items():
            values = data["values"]
            analytics[userid] = {
                "userid": userid,
                "max": max(values),
                "min": min(values),
                "avg": sum(values) / len(values),
                "count": len(values),
                "last_updated": time.time()
            }
        
        cursor.close()
        mysql_conn.close()
        
        mongo_client = get_mongodb_connection()
        db = mongo_client.analyticsdb
        collection = db.analytics
        
        for userid, data in analytics.items():
            collection.update_one(
                {"userid": userid},
                {"$set": data},
                upsert=True
            )
        
        mongo_client.close()
        print("Analytics calculated and stored successfully")
    except Exception as e:
        print(f"Error calculating analytics: {e}")

if __name__ == "__main__":
    # Start the Flask app in a separate thread
    from threading import Thread
    Thread(target=lambda: app.run(host='0.0.0.0', port=8080, debug=False)).start()
    
    # Run the analytics calculation loop
    time.sleep(30) 
    while True:
        try:
            calculate_analytics()
        except Exception as e:
            print(f"An error occurred in the main loop: {e}")
        time.sleep(60)  # Run every minute