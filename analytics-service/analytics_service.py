import os
import time
import mysql.connector
from pymongo import MongoClient
from mysql.connector import Error

def get_mysql_connection():
    return mysql.connector.connect(
        host=os.environ.get('MYSQL_HOST', 'mysql'),
        user=os.environ.get('MYSQL_USER', 'reader'),
        password=os.environ.get('MYSQL_PASSWORD', 'readerpassword'),
        database=os.environ.get('MYSQL_DATABASE', 'datadb')
    )

def get_mongodb_connection():
    return MongoClient(os.environ.get('MONGO_URI', 'mongodb://writer:writerpassword@mongodb:27017/analyticsdb'))

def calculate_analytics():
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
            "max": max(values),
            "min": min(values),
            "avg": sum(values) / len(values),
            "count": len(values)
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

if __name__ == "__main__":
    while True:
        try:
            calculate_analytics()
            print("Analytics calculated and stored successfully")
        except Exception as e:
            print(f"An error occurred: {e}")
        time.sleep(60)  # Run every minute
