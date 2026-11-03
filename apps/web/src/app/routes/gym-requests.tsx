import { createFileRoute } from "@tanstack/react-router";
import { GymRequestsPage } from "../../features/gyms/GymRequestsPage";

export const Route = createFileRoute("/gym-requests")({ component: GymRequestsPage });
