// app/timelines/page.tsx

type TimelineSummary = {
    timelineId: string;
    title: string;
};

export default async function TimelinesPage() {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/timelinesummaries`, {
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error('Failed to fetch timeline summaries');
    }

    const timelines: TimelineSummary[] = await res.json();

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Select a Timeline</h1>
            <ul className="space-y-4">
                {timelines.map((timeline) => (
                    <li key={timeline.timelineId}>
                        <a
                            href={`/timeline/${timeline.timelineId}`}
                            className="block border p-4 rounded hover:bg-gray-100 transition"
                        >
                            {timeline.title}
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}