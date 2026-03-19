import React from "react";

export function ContactAddFabIcon(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="contacts-fab-svgIcon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.2002 12C11.857 12 13.2002 10.6569 13.2002 9C13.2002 7.34315 11.857 6 10.2002 6C8.54334 6 7.2002 7.34315 7.2002 9C7.2002 10.6569 8.54334 12 10.2002 12Z"
        className="contacts-fab-icon-stroke"
      />
      <path
        d="M5 18.8C5.9 16.3 7.8 15 10.2 15C12.6 15 14.5 16.3 15.4 18.8"
        className="contacts-fab-icon-stroke"
      />
      <path d="M19.2002 8V16" className="contacts-fab-icon-plus" />
      <path d="M16.2002 12H22.2002" className="contacts-fab-icon-plus" />
    </svg>
  );
}
