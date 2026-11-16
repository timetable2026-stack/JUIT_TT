import { PortalPage } from "@/components/PortalPage";

// Served from cache and rebuilt in the background; a publish or announcement revalidates it at once.
export const revalidate = 60;

export default function Page() { return <PortalPage />; }
