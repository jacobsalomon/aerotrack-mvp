// /inspect — Entry point for CMM-guided inspections
// Technician selects a component, picks a template, chooses config variant, and starts.

import InspectSelectClient from "./inspect-select-client";

export default function InspectPage() {
  return <InspectSelectClient />;
}
