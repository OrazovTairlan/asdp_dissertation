import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Gauge, gaugeClasses } from '@mui/x-charts/Gauge';
import { clamp, kpiColor } from '../utils/format';

export default function KpiGauge({ value, size = 200 }) {
  const theme = useTheme();
  const v = clamp(Number(value) || 0);
  const color = theme.palette[kpiColor(v)].main;

  return (
    <Box role="img" aria-label={`Итоговый KPI: ${v}%`} sx={{ width: size, height: size * 0.85 }}>
      <Gauge
        width={size}
        height={size * 0.85}
        value={v}
        valueMin={0}
        valueMax={100}
        startAngle={-110}
        endAngle={110}
        innerRadius="76%"
        outerRadius="100%"
        cornerRadius="50%"
        text={({ value: val }) => `${val}%`}
        sx={{
          [`& .${gaugeClasses.valueArc}`]: { fill: color },
          [`& .${gaugeClasses.referenceArc}`]: { fill: theme.palette.action.disabledBackground },
          [`& .${gaugeClasses.valueText}`]: { fontSize: size / 5.2, fontWeight: 700, fill: theme.palette.text.primary },
        }}
      />
    </Box>
  );
}
