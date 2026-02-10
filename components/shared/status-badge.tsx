import { Badge } from "@/components/ui/badge";

const statusColors: Record<string, string> = {
  serviceable: "bg-green-100 text-green-800 border-green-200",
  "in-repair": "bg-yellow-100 text-yellow-800 border-yellow-200",
  installed: "bg-blue-100 text-blue-800 border-blue-200",
  retired: "bg-gray-100 text-gray-600 border-gray-200",
  quarantined: "bg-red-100 text-red-800 border-red-200",
};

const severityColors: Record<string, string> = {
  info: "bg-blue-100 text-blue-800 border-blue-200",
  warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
  critical: "bg-red-100 text-red-800 border-red-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={statusColors[status] || "bg-gray-100 text-gray-800"}>
      {status.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge variant="outline" className={severityColors[severity] || "bg-gray-100 text-gray-800"}>
      {severity.toUpperCase()}
    </Badge>
  );
}
