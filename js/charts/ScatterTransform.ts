import * as _ from 'lodash'
import * as d3 from 'd3'
import ChartConfig from './ChartConfig'
import {computed, observable, extras} from 'mobx'
import {defaultTo, first, last} from './Util'
import {DimensionWithData} from './ChartData'
import {ScatterSeries, ScatterValue} from './PointsWithLabels'
import AxisSpec from './AxisSpec'
import {formatValue, domainExtent, findClosest} from './Util'
import ColorSchemes from './ColorSchemes'
import IChartTransform from './IChartTransform'

// Responsible for translating chart configuration into the form
// of a scatter plot
export default class ScatterTransform implements IChartTransform {
    chart: ChartConfig

    constructor(chart: ChartConfig) { 
        this.chart = chart
    }

    @observable.ref useTimelineDomains = false

    @computed get isValidConfig(): boolean {
        return _.some(this.chart.dimensions, d => d.property == 'y') && _.some(this.chart.dimensions, d => d.property == 'x')
    }

    @computed get failMessage(): string|undefined {
        const {filledDimensions} = this.chart.data
        if (!_.some(filledDimensions, d => d.property == 'y'))
            return "Missing Y axis variable"
        else if (!_.some(filledDimensions, d => d.property == 'x'))
            return "Missing X axis variable"
        else if (_.isEmpty(this.possibleEntities))
            return "No entities with data for both X and Y"
        else if (_.isEmpty(this.timelineYears))
            return "No years with data for both X and Y"
        else if (_.isEmpty(this.currentData))
            return "No matching data"
    }

    // Scatterplot should have exactly one dimension for each of x and y
    // The y dimension is treated as the "primary" variable
    @computed get yDimension(): DimensionWithData|undefined {
        return _.find(this.chart.data.filledDimensions, d => d.property == 'y')
    }
    @computed get xDimension(): DimensionWithData|undefined {
        return _.find(this.chart.data.filledDimensions, d => d.property == 'x')
    }
    @computed get colorDimension(): DimensionWithData|undefined {
        return _.find(this.chart.data.filledDimensions, d => d.property == 'color')
    }
    @computed get axisDimensions(): DimensionWithData[] {
        let dimensions = []
        if (this.yDimension) dimensions.push(this.yDimension)
        if (this.xDimension) dimensions.push(this.xDimension)
        return dimensions
    }

    // Possible to override the x axis dimension to target a special year
    // In case you want to graph say, education in the past and democracy today https://ourworldindata.org/grapher/correlation-between-education-and-democracy
    @computed get xOverrideYear(): number|undefined {
        return this.xDimension && this.xDimension.targetYear
    }

    set xOverrideYear(value: number|undefined) {
        (this.xDimension as DimensionWithData).props.targetYear = value
    }

    // In relative mode, the timeline scatterplot calculates changes relative
    // to the lower bound year rather than creating an arrow chart
    @computed get isRelativeMode() {
		return this.chart.props.stackMode == 'relative'
    }

    @computed get canToggleRelative() {
        return this.hasTimeline && !this.chart.props.hideRelativeToggle && this.xOverrideYear == null
    }

    // Unlike other charts, the scatterplot shows all available data by default, and the selection
    // is just for emphasis. But this behavior can be disabled.
    @computed get hideBackgroundEntities() {
        return this.chart.addCountryMode == 'disabled'
    }
    @computed get possibleEntities() {
        const yEntities = this.yDimension ? this.yDimension.variable.entitiesUniq : []
        const xEntities = this.xDimension ? this.xDimension.variable.entitiesUniq : []
        return _.intersection(yEntities, xEntities)
    }
    @computed get entitiesToShow() {
        if (this.hideBackgroundEntities)
            return this.chart.data.selectedEntities
        else
            return this.possibleEntities
    }

    @computed get timelineYears(): number[] {
        const yDimensionYears = this.yDimension ? this.yDimension.variable.yearsUniq : []
        const xDimensionYears = this.xDimension ? this.xDimension.variable.yearsUniq : []

        if (this.xOverrideYear != null)
            return yDimensionYears
        else
            return _.intersection(yDimensionYears, xDimensionYears)
    }

    @computed get minTimelineYear(): number {
        return defaultTo(_.min(this.timelineYears), 1900)
    }

    @computed get maxTimelineYear(): number {
        return defaultTo(_.max(this.timelineYears), 2000)
    }

    @computed get hasTimeline(): boolean {
        return this.minTimelineYear != this.maxTimelineYear && !this.chart.props.hideTimeline
    }

    @computed get startYear(): number {
        const [minYear, maxYear] = this.chart.timeDomain

        if (minYear != null)
            return defaultTo(findClosest(this.timelineYears, minYear), this.minTimelineYear)
        else
            return this.maxTimelineYear
    }

    @computed get endYear(): number {
        const [minYear, maxYear] = this.chart.timeDomain

        if (maxYear != null)
            return defaultTo(findClosest(this.timelineYears, maxYear), this.maxTimelineYear)
        else
            return this.maxTimelineYear
    }

    @computed get compareEndPointsOnly(): boolean {
        return !!this.chart.props.compareEndPointsOnly
    }

    set compareEndPointsOnly(value: boolean) {
        this.chart.props.compareEndPointsOnly = value||undefined
    }

    @computed.struct get yearsToCalculate(): number[] {
        if (this.hasTimeline) {
            return this.timelineYears
        } else {
            return this.timelineYears.filter(y => y >= this.startYear && y <= this.endYear)
        }
    }

    @computed get defaultColors(): string[] {
        return [ // default color scheme for continents
            "#5675c1", // Africa
            "#aec7e8", // Antarctica
            "#d14e5b", // Asia
            "#ffd336", // Europe
            "#4d824b", // North America
            "#a652ba", // Oceania
            "#69c487", // South America
            "#ff7f0e", "#1f77b4", "#ffbb78", "#2ca02c", "#98df8a", "#d62728", "#ff9896", "#9467bd", "#c5b0d5", "#8c564b", "c49c94", "e377c2", "f7b6d2", "7f7f7f", "c7c7c7", "bcbd22", "dbdb8d", "17becf", "9edae5", "1f77b4"]
    }

    @computed get colorScheme(): string[] {
        const {baseColorScheme} = this.chart
        const {colorDimension} = this

        const colorScheme = baseColorScheme && ColorSchemes[baseColorScheme]
        if (!colorScheme) return this.defaultColors
        else if (!colorDimension) return colorScheme.getDistinctColors(4)
        else return colorScheme.getDistinctColors(colorDimension.variable.categoricalValues.length)
    }

    @computed get colorScale(): d3.ScaleOrdinal<string, string> {
        const {colorScheme} = this
        const colorDim = this.chart.data.dimensionsByField['color']

        const colorScale = d3.scaleOrdinal(this.colorScheme)
        if (colorDim) {
            colorScale.domain(colorDim.variable.categoricalValues);
        }

        return colorScale
    }

    // Precompute the data transformation for every timeline year (so later animation is fast)
    // If there's no timeline, this uses the same structure but only computes for a single year
    @computed get dataByEntityAndYear() {
        const {chart, yearsToCalculate, colorScale, hideBackgroundEntities, entitiesToShow, xOverrideYear} = this
        const {filledDimensions, keyColors} = chart.data
        const validEntityLookup = _.keyBy(entitiesToShow)
        
        let dataByEntityAndYear = new Map<string, Map<number, ScatterSeries>>()

        // The data values
        _.each(filledDimensions, (dimension, dimIndex) => {
            var variable = dimension.variable,
                tolerance = (dimension.property == 'color' || dimension.property == 'size') ? Infinity : dimension.tolerance;

            _.each(yearsToCalculate, (outputYear) =>  {
                for (var i = 0; i < variable.years.length; i++) {
                    var year = variable.years[i],
                        value = variable.values[i],
                        entity = variable.entities[i];

                    // Since scatterplots interrelate two variables via entity overlap, their datakeys are solely entity-based
                    const datakey = chart.data.keyFor(entity, 0)
                    
                    if (!validEntityLookup[entity])
                        continue

                    if ((dimension.property == 'x' || dimension.property == 'y') && !_.isNumber(value))
                        continue
                    
                    const targetYear = (dimension.property == 'x' && xOverrideYear != null) ? xOverrideYear : outputYear

                    // Skip years that aren't within tolerance of the target
                    if (year < targetYear-tolerance || year > targetYear+tolerance)
                        continue;

                    let dataByYear = dataByEntityAndYear.get(entity)
                    if (!dataByYear) {
                        dataByYear = new Map()
                        dataByEntityAndYear.set(entity, dataByYear)
                    }

                    let series = dataByYear.get(outputYear)
                    if (!series) {
                        series = {
                            key: datakey,
                            label: chart.data.formatKey(datakey),
                            values: [{ year: outputYear, time: {} }],
                            color: keyColors[datakey]
                        } as ScatterSeries
                        dataByYear.set(outputYear, series)
                    }

                    const d = series.values[0];

                    // Ensure we use the closest year to the target
                    const originYear = (d.time as any)[dimension.property];
                    if (_.isFinite(originYear) && Math.abs(originYear-targetYear) < Math.abs(year-targetYear))
                        continue;

                    if (dimension.property == 'color') {
                        if (!series.color) series.color = colorScale(value as string);
                    } else {
                        (d.time as any)[dimension.property] = year;
                        (d as any)[dimension.property] = value;
                    }
                }
            });
        });

        // Exclude any with data for only one axis
        dataByEntityAndYear.forEach((dataByYear, year) => {
            const newDataByYear = new Map();
            dataByYear.forEach((series, year) => {
                const datum = series.values[0];
                if (_.has(datum, 'x') && _.has(datum, 'y'))
                    newDataByYear.set(year, series);
            });
            dataByEntityAndYear.set(year, newDataByYear);
        });

        return dataByEntityAndYear;
    }    


    @computed get allGroups(): ScatterSeries[] {
        let allGroups: ScatterSeries[] = []
        this.dataByEntityAndYear.forEach(dataByYear => {
            dataByYear.forEach(group => {
                allGroups.push(group)
            })
        })
        return allGroups
    }

    @computed get allValues(): ScatterValue[] {
        return _(this.allGroups).map(group => group.values).flatten().value() as ScatterValue[]
    }

    // domains across the entire timeline
    @computed get xDomainDefault() : [number, number] {
        if (!this.useTimelineDomains) {
            const xValues = _(this.currentData).map(d => d.values).flatten().map((v: ScatterValue) => v.x).value()
            return domainExtent(xValues, this.xScaleType)
        }

        if (this.isRelativeMode) {
            let minChange = 0
            let maxChange = 0
            this.dataByEntityAndYear.forEach(dataByYear => {
                const values = _.map(Array.from(dataByYear.values()), g => g.values[0])
                for (var i = 0; i < values.length; i++) {
                    const indexValue = values[i]
                    for (var j = i; j < values.length; j++) {
                        const targetValue = values[j]
                        const change = cagrX(indexValue, targetValue)
                        if (change < minChange) minChange = change
                        if (change > maxChange) maxChange = change
                    }
                }
           })
           return [minChange, maxChange]
        } else {
            return domainExtent(this.allValues.map(v => v.x), this.xScaleType)
        }
    }

    @computed get yDomainDefault() : [number, number] {
        if (!this.useTimelineDomains) {
            const yValues = _(this.currentData).map(d => d.values).flatten().map((v: ScatterValue) => v.y).value()
            return domainExtent(yValues, this.yScaleType)
        }

        if (this.isRelativeMode) {
            let minChange = 0
            let maxChange = 0
            this.dataByEntityAndYear.forEach(dataByYear => {
                const values = _.map(Array.from(dataByYear.values()), g => g.values[0])
                for (var i = 0; i < values.length; i++) {
                    const indexValue = values[i]
                    for (var j = i; j < values.length; j++) {
                        const targetValue = values[j]
                        const change = cagrY(indexValue, targetValue)
                        if (change < minChange) minChange = change
                        if (change > maxChange) maxChange = change
                    }
                }
           })
           return [minChange, maxChange]
        } else {
            return domainExtent(this.allValues.map(v => v.y), this.yScaleType)
        }
    }

    @computed get sizeDomain(): [number, number] {
        const sizeValues = _(this.allGroups).map(g => g.values[0].size).filter(_.identity).value()
        if (sizeValues.length == 0)
            return [1,1]
        else
            return domainExtent(sizeValues, 'linear')
    }

    @computed get colorsInUse(): string[] {
        return _(this.allGroups).map(s => s.color).uniq().value()
    }

    @computed get yScaleType() {
        return this.isRelativeMode ? 'linear' : this.chart.yAxis.scaleType
    }

    @computed get yAxisLabelBase() {
        return defaultTo(this.chart.yAxis.label, this.yDimension ? this.yDimension.displayName : "")
    }

    @computed get yAxis(): AxisSpec {
        const {chart, yDomainDefault, yDimension, isRelativeMode, yScaleType, yAxisLabelBase} = this
        
        const props: Partial<AxisSpec> = {}
        props.scaleType = yScaleType
        if (isRelativeMode) {
            props.domain = yDomainDefault
            props.scaleTypeOptions = ['linear']
            const label = yAxisLabelBase
            if (label && label.length > 1) {
                props.label = "Average annual change in " + (label.charAt(1).match(/[A-Z]/) ? label : label.charAt(0).toLowerCase() + label.slice(1))
            }
            props.tickFormat = (v: number) => formatValue(v, { unit: "%" })
        } else {
            props.label = yAxisLabelBase
            props.tickFormat = yDimension && yDimension.formatValueShort
        }

        return _.extend(chart.yAxis.toSpec({ defaultDomain: yDomainDefault }), props) as AxisSpec
    }

    @computed get xScaleType() {
        return this.isRelativeMode ? 'linear' : this.chart.xAxis.scaleType
    }

    @computed get xAxisLabelBase() {
        return defaultTo(this.chart.xAxis.label, this.xDimension ? this.xDimension.displayName : "")
    }

    @computed get xAxis(): AxisSpec {
        const {chart, xDomainDefault, xDimension, isRelativeMode, xScaleType, xAxisLabelBase} = this

        const props: Partial<AxisSpec> = {}
        props.scaleType = xScaleType
        if (isRelativeMode) {
            props.domain = xDomainDefault
            props.scaleTypeOptions = ['linear']
            const label = xAxisLabelBase
            if (label && label.length > 1) {
                props.label = "Average annual change in " + (label.charAt(1).match(/[A-Z]/) ? label : label.charAt(0).toLowerCase() + label.slice(1))
            }
            props.tickFormat = (v: number) => formatValue(v, { unit: "%" })
        } else {
            props.label = xAxisLabelBase
            props.tickFormat = xDimension && xDimension.formatValueShort
        }

        return _.extend(chart.xAxis.toSpec({ defaultDomain: xDomainDefault }), props) as AxisSpec
    }

    @computed get yFormatTooltip() {
        return (this.isRelativeMode || !this.yDimension) ? this.yAxis.tickFormat : this.yDimension.formatValueLong
    }

    @computed get xFormatTooltip() {
        return (this.isRelativeMode || !this.xDimension) ? this.xAxis.tickFormat : this.xDimension.formatValueLong
    }

    @computed get currentData(): ScatterSeries[] {
        if (!this.chart.data.isReady)
            return []

        const {dataByEntityAndYear, startYear, endYear, xScaleType, yScaleType, isRelativeMode, compareEndPointsOnly, xOverrideYear} = this
        let currentData: ScatterSeries[] = [];

        // As needed, join the individual year data points together to create an "arrow chart"
        dataByEntityAndYear.forEach(dataByYear => {
            let group: ScatterSeries|undefined
            dataByYear.forEach((groupForYear, year) => {
                if (year < startYear || year > endYear)
                    return

                group = group || _.extend({}, groupForYear, { values: [] }) as ScatterSeries
                group.values = group.values.concat(groupForYear.values)
                if (_.isNumber(groupForYear.values[0].size))
                    group.size = groupForYear.values[0].size
            })

            if (group && group.values.length) {
                group.size = _(group.values).map(v => v.size).filter(s => _.isNumber(s)).last() as number
                currentData.push(group)
            }
        });

        currentData = _.map(currentData, series => {
            // Only allow tolerance data to occur once in any given chart (no duplicate data points)
            // Prioritize the start and end years first, then the "true" year
            let values = series.values
            
            values = _(values).groupBy(v => v.time.y).map((vals: ScatterValue[]) => 
                _.sortBy(vals, v => (v.year == startYear || v.year == endYear) ? -Infinity : Math.abs(v.year-v.time.y))[0]
            ).value()

            if (xOverrideYear == null) {
                values = _(values).groupBy(v => v.time.x).map((vals: ScatterValue[]) =>
                    _.sortBy(vals, v => (v.year == startYear || v.year == endYear) ? -Infinity : Math.abs(v.year-v.time.x))[0]
                ).value()
            }

            // Don't allow values <= 0 for log scales
            values = _.filter(values, v => {
                return (v.y > 0 || yScaleType != 'log') && (v.x > 0 || xScaleType != 'log')
            })

            return _.extend({}, series, {
                values: values
            })
        })

        currentData = _.filter(currentData, series => {
            // No point trying to render series with no valid points!
            return series.values.length > 0

            // This disabled behavior prevents showing data unless it spans the whole timeline range
            // We decided not to do this because it's confusing to have a series disappear when you're moving the timeline

            // && ((first(series.values).year == startYear && (last(series.values).year == endYear || first(series.values).year == startYear)) || _.includes(this.chart.data.selectedKeys, series.key))
        })

        if (compareEndPointsOnly) {
            _.each(currentData, series => {
                series.values = series.values.length == 1 ? series.values : [first(series.values), last(series.values)]
            })
        }

        if (isRelativeMode) {
            _.each(currentData, series => {
                const indexValue = first(series.values)
                const targetValue = last(series.values)
                series.values = [{
                    x: cagrX(indexValue, targetValue),
                    y: cagrY(indexValue, targetValue),
                    size: targetValue.size,
                    year: targetValue.year,
                    time: targetValue.time
                }]
            })
        }

        return currentData;
    }
}

function cagrX(indexValue: ScatterValue, targetValue: ScatterValue) {
    if (targetValue.year-indexValue.year == 0)
        return 0
    else {
        const frac = targetValue.x/indexValue.x
        if (frac < 0)
            return -(Math.pow(-frac, 1/(targetValue.year-indexValue.year)) - 1) * 100        
        else
            return (Math.pow(frac, 1/(targetValue.year-indexValue.year)) - 1) * 100
    }
}

function cagrY(indexValue: ScatterValue, targetValue: ScatterValue) {
    if (targetValue.year-indexValue.year == 0)
        return 0
    else {
        const frac = targetValue.y/indexValue.y
        if (frac < 0)
            return -(Math.pow(-frac, 1/(targetValue.year-indexValue.year)) - 1) * 100        
        else
            return (Math.pow(frac, 1/(targetValue.year-indexValue.year)) - 1) * 100
    }
}
