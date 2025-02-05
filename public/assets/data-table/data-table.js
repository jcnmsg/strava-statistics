const initDataTables = async () => {
    const dataTables = document.querySelectorAll('div[data-dataTable-settings]');

    dataTables.forEach(function (dataTableWrapperNode) {
        const settings = JSON.parse(dataTableWrapperNode.getAttribute('data-dataTable-settings'));

        const searchInput = dataTableWrapperNode.querySelector('input[type="search"]');
        const dataTable = dataTableWrapperNode.querySelector('table');

        if (!searchInput) {
            return;
        }
        if (!dataTable) {
            return;
        }

        fetch(settings.url).then(async function (response) {
            const dataRows = await response.json();
            const $scrollElement = dataTableWrapperNode.querySelector('.scroll-area');

            const clusterize = new Clusterize({
                rows: filterOnActiveRows(dataRows),
                scrollElem: $scrollElement,
                contentElem: dataTable.querySelector('tbody'),
                no_data_class: 'clusterize-loading',
                callbacks: {
                    clusterChanged: () => {
                        const summableNodes = dataTable.querySelectorAll('[data-dataTable-summable]');
                        if (summableNodes.length > 0) {
                            const sums = calculateSummables(dataRows);

                            summableNodes.forEach((summableNode) => {
                                const summable = summableNode.getAttribute('data-dataTable-summable');
                                summableNode.innerHTML = sums[summable] !== undefined ? numberFormat(sums[summable], 0, ',', ' ') : 0;
                            });
                        }

                        document.dispatchEvent(new CustomEvent('dataTableClusterWasChanged', {
                            bubbles: true,
                            cancelable: false,
                        }));
                    }
                }
            });

            let sortOnPrevious = null;
            let sortAsc = false;
            const sortableColumns = dataTable.querySelectorAll('thead tr th[data-dataTable-sort]');
            sortableColumns.forEach(element => {
                element.addEventListener('click', () => {
                    const sortOn = element.getAttribute('data-dataTable-sort');
                    if (sortOn === sortOnPrevious) {
                        sortAsc = !sortAsc;
                    }
                    sortOnPrevious = sortOn;
                    // Highlight sorting icons.
                    sortableColumns.forEach(el => el.querySelector('.sorting-icon').setAttribute('aria-sort', 'none'))
                    element.querySelector('.sorting-icon').setAttribute('aria-sort', sortAsc ? 'ascending' : 'descending');
                    // Do the actual sort.
                    dataRows.sort((a, b) => {
                        if (b.sort[sortOn] === undefined)
                            return -1;
                        if (a.sort[sortOn] === undefined)
                            return 1;

                        if (a.sort[sortOn] < b.sort[sortOn]) return sortAsc ? -1 : 1;
                        if (a.sort[sortOn] > b.sort[sortOn]) return sortAsc ? 1 : -1;
                        return 0;
                    });
                    // Update the rows.
                    clusterize.update(filterOnActiveRows(dataRows));
                    $scrollElement.scrollTop = 0;
                });
            });

            const clusterizeUpdate = debounce(() => clusterize.update(filterOnActiveRows(applySearchAndFiltersToDataRows(dataRows, dataTableWrapperNode))));
            searchInput.addEventListener("keyup", clusterizeUpdate);

            const clickableFilters = dataTableWrapperNode.querySelectorAll('input[type="checkbox"][data-dataTable-filter],input[type="radio"][data-dataTable-filter]');
            clickableFilters.forEach(element => {
                element.addEventListener('click', () => {
                    clusterize.update(filterOnActiveRows(applySearchAndFiltersToDataRows(dataRows, dataTableWrapperNode)));
                    $scrollElement.scrollTop = 0;
                });
            });

            const rangeFilters = dataTableWrapperNode.querySelectorAll('[data-dataTable-filter*="[]"]');
            rangeFilters.forEach(element => {
                element.addEventListener('input', () => {
                    clusterize.update(filterOnActiveRows(applySearchAndFiltersToDataRows(dataRows, dataTableWrapperNode)));
                    $scrollElement.scrollTop = 0;
                });
            });

            dataTableWrapperNode.querySelector('[data-dataTable-reset]').addEventListener('click', () => {
                location.reload();
            });
        });
    });
};

const applySearchAndFiltersToDataRows = function (dataRows, $dataTableNode) {
    const $searchInput = $dataTableNode.querySelector('input[type="search"]');
    const searchValue = $searchInput.value.toLowerCase();

    const $activeCheckedFilters = $dataTableNode.querySelectorAll('[data-dataTable-filter]:checked');
    const $rangeFilters = $dataTableNode.querySelectorAll('[data-dataTable-filter*="[]"]');

    const filters = [];
    $activeCheckedFilters.forEach(element => {
        const filterName = element.getAttribute('data-dataTable-filter');
        filters[filterName] = element.value.toLowerCase();
    });
    $rangeFilters.forEach(element => {
        const filterName = element.getAttribute('data-dataTable-filter').replace('[]', '');
        const $rangeInputFrom = element.querySelector('input[name="' + filterName + '[from]"]');
        if (!$rangeInputFrom) {
            throw new Error('input[name="' + filterName + '[from]"] element not found');
        }
        const $rangeInputTo = element.querySelector('input[name="' + filterName + '[to]"]');
        if (!$rangeInputTo) {
            throw new Error('input[name="' + filterName + '[to]"] element not found');
        }

        if (!isNaN($rangeInputFrom.valueAsNumber) && !isNaN($rangeInputTo.valueAsNumber)) {
            filters[filterName] = [$rangeInputFrom.valueAsNumber, $rangeInputTo.valueAsNumber];
        }
    });

    for (let i = 0; i < dataRows.length; i++) {
        const rowFilterables = dataRows[i].filterables;
        const searchables = dataRows[i].searchables.toLowerCase();
        dataRows[i].active = !(searchables.indexOf(searchValue) === -1);

        for (const filter in filters) {
            const filterValue = filters[filter];
            if (Array.isArray(filterValue)) {
                // This is range filter.
                dataRows[i].active = dataRows[i].active && filter in rowFilterables && filterValue[0] <= rowFilterables[filter] && rowFilterables[filter] <= filterValue[1]
            } else {
                dataRows[i].active = dataRows[i].active && filter in rowFilterables && rowFilterables[filter].toLowerCase() === filterValue
            }
        }
    }

    return dataRows;
};

const calculateSummables = function (dataRows) {
    const sums = [];
    dataRows.filter((row) => row.active).map((row) => row.summables).forEach((summables => {
        Object.keys(summables).forEach(summable => {
            if (sums[summable] === undefined) {
                sums[summable] = 0;
            }
            sums[summable] += summables[summable];
        });
    }));

    return sums;
}

const filterOnActiveRows = function (rows) {
    return rows.filter((row) => row.active).map((row) => row.markup);
}