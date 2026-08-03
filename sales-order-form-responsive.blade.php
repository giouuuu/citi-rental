<form class="p-0">
    <div class="container-fluid px-0 py-3">
        <div class="card border-0 shadow-sm">
            <div class="card-header bg-primary text-white d-flex align-items-center justify-content-between">
                <h5 class="mb-0">Sales Order</h5>
                <span class="badge badge-light">
                    {{
                        !empty($show['isHold']) && $show['isHold'] && $show['status'] === 'O'
                            ? 'Hold'
                            : (!empty($create)
                                ? $create['statusDescription']
                                : $show['statusDescription'])
                    }}
                </span>
            </div>

            <div class="card-body">
                <div class="d-flex flex-wrap align-items-start mb-3 {{ !empty($create) ? 'd-none' : '' }}">
                    <button type="button" class="btn btn-outline-secondary btn-sm mr-2 mb-2">
                        SO No.
                    </button>
                    <button
                        type="button"
                        class="btn btn-outline-secondary btn-sm text-right mr-2 mb-2"
                        id="transNo"
                        data-val="{{ !empty($create) ? $create['orderNo'] : $show['orderNo'] }}">
                        {{ !empty($create) ? $create['orderNo'] : $show['orderNo'] }}
                    </button>

                    @php
                        $isHold = !empty($show['isHold']) && $show['isHold'] && $show['status'] === 'O';
                    @endphp

                    <button
                        type="button"
                        class="btn btn-sm mr-2 mb-2 {{ !empty($create) ? 'btn-primary' : $show['statusClass'] }}">
                        {{
                            $isHold
                                ? 'Hold'
                                : (!empty($create)
                                    ? $create['statusDescription']
                                    : $show['statusDescription'])
                        }}
                    </button>

                    @if (!empty($show['parentId']))
                        <button type="button" class="btn btn-outline-secondary btn-sm mr-2 mb-2">
                            Parent SO No.
                        </button>
                        <button
                            id="btnParent"
                            type="button"
                            data-id="{{ $show['parentId'] }}"
                            class="btn btn-primary btn-sm mb-2">
                            {{ $show['parentId'] }}
                        </button>
                    @endif
                </div>

                <div class="row">
                    <div class="col-12 col-md-6 col-xl-12 mb-3">
                        <div class="card h-100">
                            <div class="card-header bg-light d-flex align-items-center justify-content-between py-2">
                                <h6 class="text-info text-uppercase mb-0">Order Details</h6>
                                <kbd>⇧ C</kbd>
                            </div>

                            <div class="card-body">
                                <div class="row align-items-start">
                                    <div class="col-12 col-xl-4 mb-3 mb-xl-0">
                                        <div class="input-wrapper required">
                                            <select
                                                id="company"
                                                class="form-control input-field select2 canBeDisable"></select>
                                            <label class="floating-label font-10px">Company (⇧ + C)</label>
                                        </div>
                                    </div>

                                    <div class="col-12 col-xl-4 mb-3 mb-xl-0">
                                        <div class="input-wrapper required">
                                            <select
                                                id="whse"
                                                class="input-field select2-field select2 canBeDisable"></select>
                                            <label class="floating-label font-10px">Warehouse (⇧ + W)</label>
                                        </div>
                                    </div>

                                    <div class="col-12 col-xl-4">
                                        <div class="input-wrapper required">
                                            <input
                                                type="text"
                                                class="input-field canBeDisable"
                                                id="orderDate"
                                                autocomplete="off"
                                                disabled>
                                            <label class="floating-label font-10px">Order Date (⇧ + R)</label>
                                            <span class="input-icon">
                                                <i class="fa fa-fw fa-calendar"></i>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-12 col-md-6 col-xl-4 mb-3">
                        <div class="card h-100">
                            <div class="card-header bg-light d-flex align-items-center justify-content-between py-2">
                                <h6 class="text-info text-uppercase mb-0">Ordered By</h6>
                                <kbd>⇧ O</kbd>
                            </div>

                            <div class="card-body d-flex flex-column">
                                <div class="input-wrapper required canBeDisable mb-3">
                                    <select
                                        id="orderedBy"
                                        class="input-field select2-field select2 canBeDisable"></select>
                                    <label class="floating-label font-10px d-none">Ordered By</label>
                                </div>

                                <div class="row align-items-start mt-auto">
                                    <div class="col-12 col-lg-6 mb-3 mb-lg-0">
                                        <div class="input-wrapper canBeDisable">
                                            <input type="text" class="input-field" id="poDoc">
                                            <label class="floating-label font-10px">P.O. Reference</label>
                                        </div>
                                    </div>

                                    <div class="col-12 col-lg-6">
                                        <div class="input-wrapper">
                                            <input
                                                type="text"
                                                class="input-field date canBeDisable"
                                                id="poDate"
                                                autocomplete="off">
                                            <label class="floating-label font-10px">P.O. Date (⇧ + P)</label>
                                            <span class="input-icon">
                                                <i class="fa fa-fw fa-calendar"></i>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-12 col-md-6 col-xl-4 mb-3">
                        <div class="card h-100">
                            <div class="card-header bg-light d-flex align-items-center justify-content-between py-2">
                                <h6 class="text-info text-uppercase mb-0">Invoiced To</h6>
                                <kbd>⇧ I</kbd>
                            </div>

                            <div class="card-body d-flex flex-column">
                                <div class="input-wrapper required mb-3">
                                    <select
                                        id="invoiceTo"
                                        class="input-field select2-field select2 canBeDisable"></select>
                                    <label class="floating-label font-10px d-none">Invoice To</label>
                                </div>

                                <div class="input-wrapper required mt-auto">
                                    <input
                                        type="text"
                                        class="input-field canBeDisable"
                                        id="fullDate"
                                        autocomplete="off">
                                    <label class="floating-label font-10px">Fulfilment Date (⇧ + F)</label>
                                    <span class="input-icon">
                                        <i class="fa fa-fw fa-calendar"></i>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-12 col-md-6 col-xl-4 mb-3">
                        <div class="card h-100">
                            <div class="card-header bg-light d-flex align-items-center justify-content-between py-2">
                                <h6 class="text-info text-uppercase mb-0">Delivered To</h6>
                                <kbd>⇧ T</kbd>
                            </div>

                            <div class="card-body d-flex flex-column">
                                <div class="input-wrapper required mb-3">
                                    <select
                                        id="deliveredTo"
                                        class="input-field select2-field select2 canBeDisable"></select>
                                    <label class="floating-label font-10px d-none">Delivered To</label>
                                </div>

                                <div class="row align-items-start mt-auto">
                                    <div class="col-12 col-lg-7 mb-3 mb-lg-0">
                                        <div class="input-wrapper required">
                                            <input
                                                type="text"
                                                class="input-field date canBeDisable"
                                                id="delDate"
                                                autocomplete="off">
                                            <label class="floating-label font-10px">Delivery Date (⇧ + D)</label>
                                            <span class="input-icon">
                                                <i class="fa fa-fw fa-calendar"></i>
                                            </span>
                                        </div>
                                    </div>

                                    <div class="col-12 col-lg-5">
                                        <button
                                            type="button"
                                            class="btn btn-info btn-block"
                                            data-toggle="modal"
                                            data-target="#conditionModal">
                                            Condition (⇧ + ~)
                                        </button>
                                        <button
                                            type="button"
                                            class="btn btn-info btn-block d-none"
                                            id="loadItems">
                                            Load Items
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="input-wrapper mb-4">
                    <input type="text" class="input-field canBeDisable" id="description">
                    <label class="floating-label font-10px">Description</label>
                </div>

                <div>
                    <h6 class="text-info text-uppercase mb-3">Ordered Items</h6>

                    @php
                        $statusDescription = !empty($create)
                            ? $create['statusDescription']
                            : $show['statusDescription'];

                        $hideAddItem = in_array($statusDescription, ['Open', 'Authorize']);
                    @endphp

                    @if ($hideAddItem)
                        @if ($haveAccess)
                            @include('app.order.sales-order.components.add_item')
                        @else
                            <div class="alert alert-danger mb-0">
                                This user has no rights to access this section.
                            </div>
                        @endif
                    @endif

                    <div class="table-responsive">
                        <table id="myTable" class="table table-striped table-hover table-sm text-nowrap w-100">
                            <thead class="bg-primary text-white">
                                <tr>
                                    <th></th>
                                    <th></th>
                                    <th></th>
                                    <th></th>
                                    <th></th>
                                    <th></th>
                                    <th></th>
                                    <th></th>
                                    <th></th>
                                    <th></th>
                                    <th></th>
                                </tr>
                            </thead>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
</form>
