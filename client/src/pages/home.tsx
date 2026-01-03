import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SketchDecoration, SketchLogo, SketchDivider } from '@/components/sketch';

export function HomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/lobby');
  }, [navigate]);

  return (
    <div className="min-h-screen paper-texture flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <SketchDecoration type="music" />
      <div className="w-full max-w-md text-center space-y-4">
        <SketchLogo />
        <SketchDivider />
        <p className="text-muted-foreground">正在前往大厅...</p>
      </div>
    </div>
  );
}
