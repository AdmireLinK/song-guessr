import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';
import { Button, Input, Card, CardContent, CardHeader, CardTitle, Label } from '@/components/ui';
import { SketchDivider, LoadingSpinner, NotebookPage } from '@/components/sketch';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!username.trim() || !password) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const serverUrl = import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${serverUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      
      const data = await response.json();
      
      if (data.success && data.token) {
        localStorage.setItem('adminToken', data.token);
        navigate('/admin');
      } else {
        setError(data.message || '登录失败');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('无法连接到服务器');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <NotebookPage>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto bg-sketch-paper rounded-full border-2 border-sketch-ink flex items-center justify-center shadow-sketch rotate-[-3deg] mb-4">
               <Shield className="w-10 h-10 text-sketch-ink" />
            </div>
            <h1 className="text-4xl font-hand font-bold text-sketch-ink">管理员登录</h1>
          </div>
          
          <SketchDivider />
          
          <Card className="mt-8 bg-white rotate-1">
            <CardHeader>
              <CardTitle className="text-xl text-center">🔐 请输入管理员凭证</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="font-hand font-bold text-lg">用户名</Label>
                  <Input
                    placeholder="管理员用户名"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    className="text-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-hand font-bold text-lg">密码</Label>
                  <Input
                    type="password"
                    placeholder="管理员密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    className="text-lg"
                  />
                </div>
                
                {error && (
                  <p className="text-sm text-red-500 text-center font-hand font-bold">⚠️ {error}</p>
                )}
                
                <Button
                  onClick={handleLogin}
                  disabled={!username.trim() || !password || isLoading}
                  className="w-full font-hand font-bold text-xl"
                  size="lg"
                >
                  {isLoading ? <LoadingSpinner /> : '登录'}
                </Button>
                
                <Button
                  variant="ghost"
                  onClick={() => navigate('/')}
                  className="w-full font-hand text-sketch-ink/60"
                >
                  返回首页
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </NotebookPage>
  );
}
