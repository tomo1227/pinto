import { Hono } from 'hono';

const app = new Hono();

app.get('/', (context) => context.text('Hello World!'));
app.get('/api/hello', (context) => context.json({ message: 'Hello World!' }));

export default app;
