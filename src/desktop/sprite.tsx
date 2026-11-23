const PATHS: Record<string, React.ReactNode> = {
    grid: (
        <>
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>
    ),
    list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
    wallet: (
        <>
            <path d="M3 7.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7.5" />
            <path d="M3 7.5h18M16 3.5V7.5H8V3.5h8z" />
            <circle cx="16.5" cy="13.5" r="1.2" />
        </>
    ),
    wallet2: (
        <>
            <rect x="3" y="6" width="18" height="13" rx="2.5" />
            <path d="M3 11h18M16 3.5V6H8V3.5h8z" />
        </>
    ),
    target: (
        <>
            <circle cx="12" cy="12" r="8.5" />
            <circle cx="12" cy="12" r="4.5" />
            <circle cx="12" cy="12" r="1" />
        </>
    ),
    repeat: (
        <>
            <path d="M4 9a8 8 0 0 1 14-2l2 2M20 15a8 8 0 0 1-14 2l-2-2" />
            <path d="M18 4v5M18 9l3-2M6 20v-5M6 15l-3 2" />
        </>
    ),
    import: (
        <>
            <path d="M12 3v11M12 14l-3.5-3.5M12 14l3.5-3.5" />
            <path d="M4 16.5v2A2 2 0 0 0 6 20.5h12a2 2 0 0 0 2-2v-2" />
        </>
    ),
    plug: <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v4" />,
    gear: (
        <>
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
        </>
    ),
    search: (
        <>
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
        </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    refresh: (
        <>
            <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4M20 8l-3.5-.6" />
            <path d="M4 12a8 8 0 0 1 2.3-5.6M4 4v4M4 8l3.5-.6" />
        </>
    ),
    moon: <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5 8.5 8.5 0 0 0 20.5 14.5z" />,
    edit: <path d="M4 20h4L20 8l-4-4L4 16v4zM13 7l4 4" />,
    trash: <path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13M10 11v5M14 11v5" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    alert: (
        <>
            <path d="M12 3l9 16H3z" />
            <path d="M12 9v5M12 17h.01" />
        </>
    ),
    check: <path d="M4.5 12.5l5 5L20 7" />,
    'arrow-up': <path d="M12 20V5M6.5 10.5L12 5l5.5 5.5" />,
    'arrow-down': <path d="M12 4v15M6.5 13.5L12 19l5.5-5.5" />,
    link: <path d="M10.5 13.5l3-3M7 17a4 4 0 0 1 0-5.6l2-2M17 7a4 4 0 0 1 0 5.6l-2 2" />,
    download: <path d="M12 4v10M8 10l4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
    calendar: (
        <>
            <rect x="3" y="5" width="18" height="16" rx="2.5" />
            <path d="M3 10h18M8 3v4M16 3v4" />
        </>
    ),
    'chev-left': <path d="M15 5l-7 7 7 7" />,
    'chev-right': <path d="M9 5l7 7-7 7" />,
    'chev-down': <path d="M6 9l6 6 6-6" />,
    'chev-double-left': <path d="M11 6l-6 6 6 6M18 6l-6 6 6 6" />,
    'chev-double-right': <path d="M13 6l6 6-6 6M6 6l6 6-6 6" />,
    activity: <path d="M3 12h4l2.5-7 4 14 2.5-7H21" />,
    shield: (
        <>
            <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
            <path d="M9 12l2 2 4-4" />
        </>
    ),
    inbox: (
        <>
            <path d="M4 13h4l1.5 2.5h5L16 13h4" />
            <path d="M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7l-1.5 7.5h-13z" />
        </>
    ),
};

export const IconSprite = () => (
    <svg style={{ display: 'none' }} aria-hidden="true">
        {Object.entries(PATHS).map(([name, body]) => (
            <symbol key={name} id={`i-${name}`} viewBox="0 0 24 24">
                {body}
            </symbol>
        ))}
    </svg>
);
