using System.Globalization;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using Typle.Core;
using Windows.Foundation;

namespace Typle.Support;

/// <summary>
/// The web app's line chart (src/components/Dashboard/TrendChart.tsx): three gridlines with their values, the line with
/// a soft fill and a dot on the latest point, and the first and last dates below. It is drawn again when its width
/// changes.
/// </summary>
public static class TrendChart
{
    private const double Axis = 40;

    public static UIElement Create(IReadOnlyList<TrendPoint> points, Scale scale, double height = 72)
    {
        var palette = Palette.Current;
        var canvas = new Canvas { Height = height, Margin = new Thickness(0, 8, 0, 8) };
        canvas.SizeChanged += (_, args) => Draw(canvas, points, scale, args.NewSize.Width, height, palette);
        var dates = Ui.Cells(0,
            (Ui.Px(Axis), null),
            (Ui.Star(), Ui.T(Format.ShortDate(points.FirstOrDefault()?.Date), 11, color: palette.MutedForeground, tabular: true, maxLines: 1)),
            (Ui.Auto, Ui.T(Format.ShortDate(points.LastOrDefault()?.Date), 11, color: palette.MutedForeground, tabular: true, maxLines: 1)));
        var chart = Ui.Column(4, canvas, dates);
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(chart,
            string.Join(", ", points.Select(point => $"{Format.ShortDate(point.Date)} {Format.Number(point.Value, 2)}")));
        return chart;
    }

    private static void Draw(Canvas canvas, IReadOnlyList<TrendPoint> points, Scale scale, double width, double height, Palette palette)
    {
        canvas.Children.Clear();
        var left = Axis + 4;
        var right = width - 4;
        double Y(double value) => (1 - (value - scale.Low) / Math.Max(scale.High - scale.Low, 0.000001)) * height;
        double X(int index) => points.Count > 1 ? left + (double)index / (points.Count - 1) * (right - left) : (left + right) / 2;
        foreach (var tick in scale.Ticks)
        {
            var y = Y(tick);
            canvas.Children.Add(new Line { X1 = left, X2 = right, Y1 = y, Y2 = y, Stroke = Ui.Brush(palette.Border), StrokeThickness = 1 });
            var label = new TextBlock
            {
                Text = tick.ToString("F" + scale.Decimals, CultureInfo.InvariantCulture), FontSize = 11, Width = Axis,
                TextAlignment = TextAlignment.Center, Foreground = Ui.Brush(palette.MutedForeground),
            };
            Canvas.SetLeft(label, 0);
            Canvas.SetTop(label, y - 8);
            canvas.Children.Add(label);
        }
        if (points.Count == 0) return;
        var line = new PointCollection();
        var area = new PointCollection();
        for (var i = 0; i < points.Count; i++)
        {
            line.Add(new Point(X(i), Y(points[i].Value)));
            area.Add(new Point(X(i), Y(points[i].Value)));
        }
        area.Add(new Point(X(points.Count - 1), height));
        area.Add(new Point(X(0), height));
        canvas.Children.Add(new Polygon { Points = area, Fill = Ui.Brush(Palette.WithAlpha(palette.Trend, 0.1)) });
        canvas.Children.Add(new Polyline
        {
            Points = line, Stroke = Ui.Brush(palette.Trend), StrokeThickness = 2, StrokeLineJoin = PenLineJoin.Round,
            StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round,
        });
        var last = new Point(X(points.Count - 1), Y(points[^1].Value));
        var dot = new Ellipse
        {
            Width = 10, Height = 10, Fill = Ui.Brush(palette.Card), Stroke = Ui.Brush(palette.Trend), StrokeThickness = 2,
        };
        Canvas.SetLeft(dot, last.X - 5);
        Canvas.SetTop(dot, last.Y - 5);
        canvas.Children.Add(dot);
    }
}
