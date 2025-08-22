#!/usr/bin/env python3
"""
Backend API Testing for Echo Tap FastAPI endpoints
Tests the three main endpoints: GET /api, POST /api/status, GET /api/status
"""

import requests
import json
import uuid
from datetime import datetime
import sys
import os

# Get backend URL from frontend .env file
def get_backend_url():
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                    return line.split('=', 1)[1].strip()
    except Exception as e:
        print(f"Error reading frontend .env: {e}")
        return None

def test_get_root():
    """Test GET /api endpoint"""
    print("\n=== Testing GET /api ===")
    
    backend_url = get_backend_url()
    if not backend_url:
        print("❌ FAILED: Could not get backend URL from frontend/.env")
        return False
    
    url = f"{backend_url}/api"
    print(f"Testing URL: {url}")
    
    try:
        response = requests.get(url, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("message") == "Hello World":
                print("✅ PASSED: GET /api returned correct response")
                return True
            else:
                print(f"❌ FAILED: Expected message 'Hello World', got {data}")
                return False
        else:
            print(f"❌ FAILED: Expected status 200, got {response.status_code}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ FAILED: Request error - {e}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ FAILED: JSON decode error - {e}")
        return False

def test_post_status():
    """Test POST /api/status endpoint"""
    print("\n=== Testing POST /api/status ===")
    
    backend_url = get_backend_url()
    if not backend_url:
        print("❌ FAILED: Could not get backend URL from frontend/.env")
        return False, None
    
    url = f"{backend_url}/api/status"
    print(f"Testing URL: {url}")
    
    # Use realistic test data
    test_data = {"client_name": "echo_tap_tester"}
    
    try:
        response = requests.post(url, json=test_data, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Check required fields
            required_fields = ["id", "client_name", "timestamp"]
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                print(f"❌ FAILED: Missing required fields: {missing_fields}")
                return False, None
            
            # Validate field types and values
            try:
                # Check if id is a valid UUID string
                uuid.UUID(data["id"])
                print(f"✓ Valid UUID: {data['id']}")
            except ValueError:
                print(f"❌ FAILED: Invalid UUID format: {data['id']}")
                return False, None
            
            # Check client_name matches
            if data["client_name"] != test_data["client_name"]:
                print(f"❌ FAILED: client_name mismatch. Expected: {test_data['client_name']}, Got: {data['client_name']}")
                return False, None
            
            # Check timestamp is valid ISO format
            try:
                datetime.fromisoformat(data["timestamp"].replace('Z', '+00:00'))
                print(f"✓ Valid timestamp: {data['timestamp']}")
            except ValueError:
                print(f"❌ FAILED: Invalid timestamp format: {data['timestamp']}")
                return False, None
            
            print("✅ PASSED: POST /api/status returned correct response with all required fields")
            return True, data
            
        else:
            print(f"❌ FAILED: Expected status 200, got {response.status_code}")
            return False, None
            
    except requests.exceptions.RequestException as e:
        print(f"❌ FAILED: Request error - {e}")
        return False, None
    except json.JSONDecodeError as e:
        print(f"❌ FAILED: JSON decode error - {e}")
        return False, None

def test_get_status(expected_client_name=None):
    """Test GET /api/status endpoint"""
    print("\n=== Testing GET /api/status ===")
    
    backend_url = get_backend_url()
    if not backend_url:
        print("❌ FAILED: Could not get backend URL from frontend/.env")
        return False
    
    url = f"{backend_url}/api/status"
    print(f"Testing URL: {url}")
    
    try:
        response = requests.get(url, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            
            if not isinstance(data, list):
                print(f"❌ FAILED: Expected array response, got {type(data)}")
                return False
            
            print(f"✓ Received array with {len(data)} items")
            
            if expected_client_name:
                # Check if our test entry exists
                matching_entries = [item for item in data if item.get("client_name") == expected_client_name]
                if matching_entries:
                    print(f"✅ PASSED: Found {len(matching_entries)} entries with client_name '{expected_client_name}'")
                    print(f"Sample entry: {matching_entries[0]}")
                    return True
                else:
                    print(f"❌ FAILED: No entries found with client_name '{expected_client_name}'")
                    return False
            else:
                print("✅ PASSED: GET /api/status returned array response")
                return True
                
        else:
            print(f"❌ FAILED: Expected status 200, got {response.status_code}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ FAILED: Request error - {e}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ FAILED: JSON decode error - {e}")
        return False

def main():
    """Run all backend tests"""
    print("🚀 Starting Backend API Tests for Echo Tap")
    print("=" * 50)
    
    results = []
    
    # Test 1: GET /api
    results.append(("GET /api", test_get_root()))
    
    # Test 2: POST /api/status
    post_success, post_data = test_post_status()
    results.append(("POST /api/status", post_success))
    
    # Test 3: GET /api/status (with verification of posted data)
    expected_client_name = "echo_tap_tester" if post_success else None
    results.append(("GET /api/status", test_get_status(expected_client_name)))
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 TEST SUMMARY")
    print("=" * 50)
    
    passed = 0
    total = len(results)
    
    for test_name, success in results:
        status = "✅ PASSED" if success else "❌ FAILED"
        print(f"{test_name}: {status}")
        if success:
            passed += 1
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All backend tests PASSED!")
        return True
    else:
        print("⚠️  Some backend tests FAILED!")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)