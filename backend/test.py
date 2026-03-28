import requests
res = requests.post("http://localhost:5000/api/volunteer", json={"name":"Test", "resource":"medical", "lat":12.97, "lng":77.59})
print(res.status_code)
print(res.text)
