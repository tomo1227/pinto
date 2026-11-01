import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "../../features/walls/DashboardPage";

export const Route = createFileRoute("/")({ component: DashboardPage });
