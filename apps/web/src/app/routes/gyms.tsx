import { createFileRoute } from "@tanstack/react-router";
import { GymsPage } from "../../features/gyms/GymsPage";

export const Route = createFileRoute("/gyms")({ component: GymsPage });
