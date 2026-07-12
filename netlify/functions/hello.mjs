export default async (req) => {
  return Response.json({
    ok: true,
    message: "Hello from Netlify Functions!",
    timestamp: new Date().toISOString(),
  });
};

export const config = {
  path: "/api/hello",
};
