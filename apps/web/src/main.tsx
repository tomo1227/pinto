import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { router } from "./app/router";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element was not found.");
createRoot(rootElement).render(<RouterProvider router={router} />);
