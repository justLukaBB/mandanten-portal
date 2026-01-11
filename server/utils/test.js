const { Storage } = require('@google-cloud/storage');

const GCS_PROJECT_ID="automationscuric"
const GCS_CLIENT_EMAIL="gcs-uploader@automationscuric.iam.gserviceaccount.com"
const GCS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEuwIBADANBgkqhkiG9w0BAQEFAASCBKUwggShAgEAAoIBAQCgnPF10etbyMOh\n34UhpZTfnml4OQpl3gg9+T4e53K15rhATU+QlBbcOzCODmI9hcGQNXNZOIehsLJb\nKo+KA+IjXuCYbv5Dp6Y1ZoWbrY2dJd5l9ljQUBoai1uM/mi4Lf79lr1TL3Bq5J1C\nWhKyFMpQMPKQq8+o7fIwp3PwghllNot16RgNQo6HC5W9OyG7g+RTskEucjL6jbrI\nKzUxcGAMptZtxQaqCTwb67ZMLRKsb+14cwXEjjqLfQwEuNtb6LSS2b0z8oBZwjXK\nObCmRIzGCTi2AOtW3f3Au8khH15rUed8CRxMkfPY3vwWu9/o7lXl68z3WN9XFUyd\nrUkG+/MzAgMBAAECggEAFDBmMbc3bIwp+zkLlRUpR4q0G0agRfnI83FXG69gPflI\ng9yz+aqDzR8rlU+9jZo4oJX3b+mpMuvxH4CUFncyf9u3Q7IACCUUwXWnqdABExXl\nhM+YjmbjQR7vXSPFqhEuElZWahR2fxlJo0OLQhNW8wmUFBdkvQlb/j2uVzcjVhN4\nCOcC4hJRvR27Fe0SKGCa5bWx4+PZdBg210/7dVmrl9KqZwQ0qQi+nAhgPyjcl19T\n1Y1Frjt7NYETPhL61esKvmn40xaCQ1netEAOz+fARineRfKVDbgWZw1pd0xnu2rh\nPZ7hLQpVLeu5OI+ulbKZZ/aQn5ZfGSPlWXJ44oOz4QKBgQDapQZ6udeDOGhlQjuF\nFnH0tAYOvA3vC7ZkoT6l+/MXlwSF5caHuq9nC7MWz83E5fuyMmyQ11zLQctEvhe9\n3lVvcwqyA3gVQ+vx6YpPS24YbAzNCPOi8lWquFEFVCtP6tKbWXXnECoCD0HnzPU0\n8MM/3lr1Tnkay90dZEDT9M7BOwKBgQC8DcK83WsM0PwPHbR3/ivAUShTNpxIqH8d\nfCtuqZ1S2r7lpDEYyEbDU4AGm9kwjpUyO/wKCs2TTglDis1WpDysT9RJvhQzN0Uk\nDXjnKscJFN6i/wCikH/+CXq4tzRZ1aAH0MfTOe9tRhLxuS9LZoL+1GqZ8GEFQhlX\npJPZyYD2aQJ/PzN0rAUMRuIHSz3Z9p6GUjW3iorRfEfmcTAq68/odOkyZYIF4TYV\nfbPkELQAxumz1867kyKtsBNUropEUp3yFEUs0kgubfc0PLlFQaaMLIMPMDVmN7PV\nD4Q351JtMqyuNDmn2yLRAcdnRZn5R1RRHCUqJb6JQzWqtNRF6P7axQKBgFEASGJb\nqVGy7u9/5w1MgQHss0bsnfK6CU7k/jxDeQ2IRXPa/n7jPX/DBsFR/gJpWCB0MAMP\nVi9eDKV4Myxfv/akyBcfdcn9w51c5DgGeAcUYzWoS1i6jzcYVDEeUMFlP/I93uS/\n7r6N0XknQBTlSgWD74rxPIksSIg0zq6fmhoJAoGBALswTd4SKQj1KeWU0cyUCCGS\nybwzBt6gaAycB9NPRSXQ4d1RfaKsJ9l2lwhkdqVE8RliclA5nPOqFyUy1XqEJOjd\n1APprNICinL0FvD4uTu6xgSE652bYfpSgj/usWlKZE7ak0Z6/PLXA6PgeFNVXzPZ\nva6e23CggFLQ2U92io2e\n-----END PRIVATE KEY-----\n"

const storage = new Storage({
  projectId: GCS_PROJECT_ID,
  credentials: {
    client_email: GCS_CLIENT_EMAIL,
    private_key: GCS_PRIVATE_KEY ,
  },
});

const options = {
  version: 'v4',
  action: 'read',
  expires: Date.now() + 15 * 60 * 1000, // 15 minutes
};

async function getSignedUrl(filename="Bildschirmfoto 2025-11-02 um 17.25.28 (1) (3).png") {
  const [url] = await storage
    .bucket('automation_scuric')
    .file(filename)
    .getSignedUrl(options);
  console.log(url);
  return url;
}


getSignedUrl();