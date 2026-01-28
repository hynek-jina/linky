interface BottomTabProps {
  icon: "contacts" | "wallet";
  isActive: boolean;
  label: string;
  onClick: () => void;
}

export function BottomTab({ label, isActive, onClick, icon }: BottomTabProps) {
  const iconContent =
    icon === "contacts" ? (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M16 11c1.657 0 3-1.567 3-3.5S17.657 4 16 4s-3 1.567-3 3.5S14.343 11 16 11Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M8 12c2.209 0 4-1.791 4-4S10.209 4 8 4 4 5.791 4 8s1.791 4 4 4Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M2 20c0-3.314 2.686-6 6-6s6 2.686 6 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M13 20c0-2.761 2.239-5 5-5s5 2.239 5 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ) : (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M3 7.5C3 6.12 4.12 5 5.5 5H18.5C19.88 5 21 6.12 21 7.5V16.5C21 17.88 19.88 19 18.5 19H5.5C4.12 19 3 17.88 3 16.5V7.5Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M17 12H21"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M15.5 10.5H18.5C19.33 10.5 20 11.17 20 12C20 12.83 19.33 13.5 18.5 13.5H15.5C14.67 13.5 14 12.83 14 12C14 11.17 14.67 10.5 15.5 10.5Z"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    );

  return (
    <button
      type="button"
      className={isActive ? "bottom-tab is-active" : "bottom-tab"}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
    >
      <span className="bottom-tab-icon" aria-hidden="true">
        {iconContent}
      </span>
      <span className="bottom-tab-label">{label}</span>
    </button>
  );
}
