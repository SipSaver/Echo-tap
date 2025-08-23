import os
import pytest

# skip if httpx isn't available (required by fastapi.testclient)
pytest.importorskip("httpx")

from fastapi.testclient import TestClient

# Ensure required environment variables for import
os.environ.setdefault('MONGO_URL', 'mongodb://localhost:27017')
os.environ.setdefault('DB_NAME', 'testdb')

from backend.server import app  # noqa: E402

class FakeCollection:
    def __init__(self):
        self.data = []

    async def insert_one(self, doc):
        self.data.append(doc)

    def find(self):
        class Cursor:
            def __init__(self, data):
                self._data = data

            async def to_list(self, length):
                return self._data

        return Cursor(self.data)


@pytest.fixture
def client(monkeypatch):
    fake_db = type('FakeDB', (), {})()
    fake_db.status_checks = FakeCollection()
    monkeypatch.setattr('backend.server.db', fake_db)
    return TestClient(app)

def test_root(client):
    resp = client.get('/api')
    assert resp.status_code == 200
    assert resp.json() == {'message': 'Hello World'}

def test_status_flow(client):
    payload = {'client_name': 'tester'}
    post = client.post('/api/status', json=payload)
    assert post.status_code == 200
    assert post.json()['client_name'] == 'tester'

    get = client.get('/api/status')
    assert get.status_code == 200
    data = get.json()
    assert any(item['client_name'] == 'tester' for item in data)
