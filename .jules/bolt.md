## 2024-05-22 - [Optimizing Nested Data Fetching]
**Learning:** Fetching deep nested data (like resources with signed URLs) in a parent view (like course overview) that doesn't use it can cause significant performance bottlenecks due to unnecessary database joins and expensive external calls (e.g., S3 signing).
**Action:** Always verify if nested data is actually used by the frontend. If not, exclude it from the API response or use a separate endpoint for detailed views.
