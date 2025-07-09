import React, { useEffect, useState } from "react";

const TestErrorComponent: React.FC = () => {
  const [shouldError, setShouldError] = useState(false);

  useEffect(() => {
    // This will trigger the error after a short delay
    const timer = setTimeout(() => {
      setShouldError(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (shouldError) {
    // This will trigger the error boundary
    throw new Error("This is a test error");
  }

  return (
    <div className="p-4 text-white">
      <h2>Testing Error Boundary</h2>
      <p>This component will throw an error in 2 seconds...</p>
    </div>
  );
};

export default TestErrorComponent;
