import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SketchDecoration, SketchLogo, SketchDivider, NotebookPage } from '@/components/sketch';

export function HomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/lobby');
  }, [navigate]);

  return (
    <NotebookPage>
      <div className="flex flex-col items-center justify-center min-h-[60vh] relative overflow-hidden">
        <SketchDecoration type="music" />
        <div className="w-full max-w-md text-center space-y-4">
          <SketchLogo />
          <SketchDivider />
          <p className="text-sketch-ink/60 font-hand text-xl">正在前往大厅...</p>
        </div>
      </div>
    </NotebookPage>
  );
}
