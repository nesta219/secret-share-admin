import type { ReactNode } from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';

interface Props {
  title: string;
  value: ReactNode;
  subtitle?: ReactNode;
  accent?: 'default' | 'success' | 'warning' | 'error';
}

const accentColor = {
  default: 'text.primary',
  success: 'success.main',
  warning: 'warning.main',
  error: 'error.main',
} as const;

export const StatCard = ({ title, value, subtitle, accent = 'default' }: Props) => (
  <Card variant="outlined">
    <CardContent>
      <Typography variant="overline" color="text.secondary">
        {title}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.5 }}>
        <Typography variant="h4" sx={{ color: accentColor[accent], fontWeight: 600 }}>
          {value}
        </Typography>
      </Box>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {subtitle}
        </Typography>
      )}
    </CardContent>
  </Card>
);
