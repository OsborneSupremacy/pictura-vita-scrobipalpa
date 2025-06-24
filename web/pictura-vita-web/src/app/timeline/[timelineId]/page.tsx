import Link from "next/link";

type Params = {
  params: {
    timelineId: string;
  };
};

export default function TimelineDetailPage({ params }: Params) {
  return (
    <div className="p-6 space-y-4">
      {/* Breadcrumbs */}
      <nav className="text-sm text-gray-600">
        <ol className="flex space-x-2">
          <li>
            <Link href="/timelines" className="hover:underline text-blue-600">
              Timelines
            </Link>
          </li>
          <li>/</li>
          <li className="text-gray-800 font-medium">{params.timelineId}</li>
        </ol>
      </nav>

      {/* Page content */}
      <h1 className="text-2xl font-bold">
        Timeline ID: {params.timelineId}
      </h1>
      <p>This is where the timeline viewer will go.</p>
    </div>
  );
}