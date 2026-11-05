import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { router } from "./app/router";
import "./styles.css";

const savedTheme = window.localStorage.getItem("pinto-theme");
document.documentElement.dataset.theme = savedTheme === "dark" ? "dark" : "light";
const savedAccent = window.localStorage.getItem("pinto-theme-accent");
document.documentElement.dataset.accent = savedAccent === "orange" ? "orange" : "blue";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element was not found.");
createRoot(rootElement).render(<RouterProvider router={router} />);
