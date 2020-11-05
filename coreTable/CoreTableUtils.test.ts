#! /usr/bin/env yarn jest

import { CoreMatrix } from "./CoreTableConstants"
import {
    emptyColumnsInFirstRowInDelimited,
    getDropIndexes,
    imemo,
    interpolateColumnsWithTolerance,
    interpolateRowValuesWithTolerance,
    matrixToDelimited,
    parseDelimited,
    rowsToMatrix,
    sortColumnStore,
    trimArray,
    trimEmptyRows,
    trimMatrix,
} from "./CoreTableUtils"
import { InvalidCellTypes } from "./InvalidCells"

describe(interpolateRowValuesWithTolerance, () => {
    it("handles empty array", () => {
        expect(
            interpolateRowValuesWithTolerance([], "value", "time", 2)
        ).toEqual([])
    })
    it("handles undefined values with infinte tolerance", () => {
        // This is an edge case that can cause problems
        expect(
            interpolateRowValuesWithTolerance(
                [{ value: undefined, time: 0 }],
                "value",
                "time",
                Infinity
            )
        ).toEqual([{ value: InvalidCellTypes.NoValueWithinTolerance, time: 0 }])
    })
    it("leaves array unchanged if tolerance = 0", () => {
        const result = interpolateRowValuesWithTolerance(
            [
                { value: 1, time: 0 },
                { value: undefined, time: 1 },
                { value: undefined, time: 2 },
                { value: 3, time: 3 },
            ],
            "value",
            "time",
            0
        )
        expect(result[1].value).toEqual(InvalidCellTypes.NoValueWithinTolerance)
        expect(result[2].value).toEqual(InvalidCellTypes.NoValueWithinTolerance)
    })
    it("fills in gaps in simple case", () => {
        const result = interpolateRowValuesWithTolerance(
            [
                { value: 1, time: 0 },
                { value: undefined, time: 1 },
                { value: undefined, time: 2 },
                { value: 3, time: 3 },
            ],
            "value",
            "time",
            2
        )
        expect(result.map((r) => r.value)).toEqual([1, 1, 3, 3])
        expect(result.map((r) => r.time)).toEqual([0, 0, 3, 3])
    })
    it("fills in initial and trailing values", () => {
        const result = interpolateRowValuesWithTolerance(
            [
                { value: undefined, time: 0 },
                { value: InvalidCellTypes.NaNButShouldBeNumber, time: 1 },
                { value: 1, time: 2 },
                { value: InvalidCellTypes.UndefinedButShouldBeNumber, time: 3 },
                { value: undefined, time: 4 },
                { value: undefined, time: 5 },
                { value: 3, time: 6 },
                { value: undefined, time: 7 },
            ],
            "value",
            "time",
            1
        )
        expect(result.map((r) => r.value)).toEqual([
            InvalidCellTypes.NoValueWithinTolerance,
            1,
            1,
            1,
            InvalidCellTypes.NoValueWithinTolerance,
            3,
            3,
            3,
        ])
        expect(result.map((r) => r.time)).toEqual([0, 2, 2, 2, 4, 6, 6, 6])
    })
    it("handles infinity tolerance", () => {
        const result = interpolateRowValuesWithTolerance(
            [
                { value: undefined, time: 0 },
                { value: InvalidCellTypes.NaNButShouldBeNumber, time: 1 },
                { value: 1, time: 2 },
                { value: undefined, time: 3 },
                { value: undefined, time: 4 },
            ],
            "value",
            "time",
            Infinity
        )
        expect(result.map((r) => r.value)).toEqual([1, 1, 1, 1, 1])
        expect(result.map((r) => r.time)).toEqual([2, 2, 2, 2, 2])
    })
})

describe(interpolateColumnsWithTolerance, () => {
    it("doesn't interpolate values beyond end", () => {
        const valuesAsc = [
            1,
            InvalidCellTypes.MissingValuePlaceholder,
            InvalidCellTypes.MissingValuePlaceholder,
            2,
        ]
        const timesAsc = [0, 1, 2, 3]
        const tolerance = 1
        interpolateColumnsWithTolerance(valuesAsc, timesAsc, tolerance, 0, 3)
        expect(valuesAsc).toEqual([
            1,
            1,
            InvalidCellTypes.MissingValuePlaceholder,
            2,
        ])
    })
})

describe("immutable memoization", () => {
    class WeatherForecast {
        conditions = "rainy"

        @imemo get forecast() {
            return this.conditions
        }
    }

    it("runs getters once", () => {
        const forecast = new WeatherForecast()
        expect(forecast.forecast).toEqual("rainy")

        forecast.conditions = "sunny"
        expect(forecast.forecast).toEqual("rainy")

        const forecast2 = new WeatherForecast()
        forecast2.conditions = "sunny"
        expect(forecast2.forecast).toEqual("sunny")
    })
})

it("can get indexes of cell values to drop in an array", () => {
    const drops = getDropIndexes(3, 2, 1)
    expect(
        [1, 2, 3].map((value, index) => (drops.has(index) ? undefined : value))
    ).toEqual([undefined, undefined, 3])
})

describe("matrix methods", () => {
    it("turns an array of objects into arrays", () => {
        const str = `gdp,pop
1,2`
        expect(rowsToMatrix(parseDelimited(str))).toEqual([
            ["gdp", "pop"],
            ["1", "2"],
        ])

        expect(rowsToMatrix(parseDelimited(""))).toEqual(undefined)

        expect(
            matrixToDelimited(rowsToMatrix(parseDelimited(str))!, ",")
        ).toEqual(str)
    })

    it("handles extra blank cells", () => {
        const table = rowsToMatrix(
            parseDelimited(`gdp pop code
123 345 usa
`)
        )
        expect(matrixToDelimited(trimMatrix(table!), " ")).toEqual(`gdp pop code
123 345 usa`)
    })

    it("can trim an array", () => {
        expect(trimArray([1, "2", "", null, undefined])).toEqual([1, "2"])
        const test = [1, "2", "", null, undefined, 1]
        expect(trimArray(test)).toEqual(test)
    })
})

describe(parseDelimited, () => {
    it("detects delimiter and parses delimited", () => {
        const str = `foo,bar
1,2`
        expect(parseDelimited(str)).toEqual(
            parseDelimited(str.replace(/,/g, "\t"))
        )
    })
})

describe(emptyColumnsInFirstRowInDelimited, () => {
    it("detects slugs needing reparsing", () => {
        const str = `location,new_cases,new_tests
usa,,
canada,,`
        expect(emptyColumnsInFirstRowInDelimited(str)).toEqual([
            "new_cases",
            "new_tests",
        ])
    })
})

describe(trimEmptyRows, () => {
    it("trims rows", () => {
        const testCases: { input: CoreMatrix; length: number }[] = [
            {
                input: [["pop"], [123], [null], [""], [undefined]],
                length: 2,
            },
            {
                input: [[]],
                length: 0,
            },
            {
                input: [
                    ["pop", "gdp"],
                    [123, 345],
                    [undefined, 456],
                ],
                length: 3,
            },
        ]

        testCases.forEach((testCase) => {
            expect(trimEmptyRows(testCase.input).length).toEqual(
                testCase.length
            )
        })
    })
})

describe(sortColumnStore, () => {
    it("can sort", () => {
        const result = sortColumnStore(
            { countries: ["usa", "can", "mex"], pops: [123, 21, 99] },
            ["pops"]
        )
        expect(result["pops"]).toEqual([21, 99, 123])
    })
})
