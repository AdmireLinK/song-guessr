import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface NotebookPageProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  showHoles?: boolean;
  paperColor?: 'white' | 'yellow' | 'blue';
}

export function NotebookPage({ 
  children, 
  className, 
  showHoles = true,
  paperColor = 'white',
}: NotebookPageProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, rotate: -1 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.5, type: "spring" }}
      className={cn(
        "notebook-page min-h-[80vh] w-full max-w-4xl mx-auto p-8 md:pl-20 md:pr-12",
        paperColor === 'yellow' && "bg-yellow-50",
        paperColor === 'blue' && "bg-blue-50",
        className
      )}
    >
      {showHoles && (
        <div className="notebook-holes hidden md:flex">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="notebook-hole" />
          ))}
        </div>
      )}
      
      {/* 顶部胶带装饰 */}
      <div className="sketch-tape" />
      
      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
}
