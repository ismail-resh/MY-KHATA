/* ==================================================
   CUSTOMERS
   Customer List
   Customer Profile
   Customer Edit / Delete
================================================== */


/* ==================================================
   VARIABLES
================================================== */

let customers = [];

let currentCustomerId = null;


/* ==================================================
   LOAD CUSTOMERS
================================================== */

async function loadCustomers(){

    const {
        data,
        error
    } = await supabaseClient
        .from("customers")
        .select("*")
        .order("name", {
            ascending:true
        });


    if(error){

        console.error(
            "Customer load error:",
            error
        );

        return;

    }


    customers = data || [];

}


/* ==================================================
   FIND CUSTOMER
================================================== */

function findCustomerByName(name){

    return customers.find(
        c =>
        c.name.trim().toLowerCase() ===
        name.trim().toLowerCase()
    );

}


/* ==================================================
   GET CUSTOMER TRANSACTIONS
================================================== */

function getCustomerTransactions(name){

    return transactions.filter(
        t =>
        t.customer_name === name
    );

}


/* ==================================================
   RENDER CUSTOMER LIST
================================================== */

async function renderCustomers(){

    const list =
        document.getElementById(
            "customerList"
        );


    if(!list){

        return;

    }


    /*
       Always load latest customers
    */

    await loadCustomers();


    const search =
        document
        .getElementById("customerSearch")
        ?.value
        .toLowerCase()
        .trim() || "";


    /*
       If old transactions exist but
       customer table somehow missed one,
       show it as well.
    */

    const customerMap = {};


    customers.forEach(c => {

        customerMap[c.name] = c;

    });


    transactions.forEach(t => {

        if(
            t.customer_name &&
            !customerMap[t.customer_name]
        ){

            customerMap[t.customer_name] = {

                id:null,

                name:t.customer_name,

                phone:""

            };

        }

    });


    let names =
        Object.keys(customerMap);


    names =
        names.filter(
            name =>
            name
            .toLowerCase()
            .includes(search)
        );


    /*
       SUMMARY
    */

    let totalReceive = 0;

    let totalPay = 0;


    transactions.forEach(t => {

        if(t.type === "receive"){

            totalReceive +=
                Number(t.amount);

        }else{

            totalPay +=
                Number(t.amount);

        }

    });


    document
        .getElementById("totalReceive")
        .innerText =
        "৳ " +
        totalReceive;


    document
        .getElementById("totalPay")
        .innerText =
        "৳ " +
        totalPay;


    document
        .getElementById("customerCount")
        .innerText =
        names.length;


    list.innerHTML = "";


    /*
       NO CUSTOMER
    */

    if(names.length === 0){

        list.innerHTML = `

            <div class="empty">

                এখনো কোনো Customer নেই।

            </div>

        `;

        return;

    }


    /*
       CUSTOMER CARDS
    */

    names.forEach(name => {


        const customer =
            customerMap[name];


        const customerTransactions =
            getCustomerTransactions(name);


        let balance = 0;


        customerTransactions.forEach(t => {

            if(t.type === "receive"){

                balance +=
                    Number(t.amount);

            }else{

                balance -=
                    Number(t.amount);

            }

        });


        let balanceHTML = "";


        if(balance > 0){

            balanceHTML = `

                <span class="receive">

                    পাবো:
                    ৳${formatMoney(balance)}

                </span>

            `;

        }
        else if(balance < 0){

            balanceHTML = `

                <span class="pay">

                    দেবো:
                    ৳${formatMoney(
                        Math.abs(balance)
                    )}

                </span>

            `;

        }
        else{

            balanceHTML = `

                <span>

                    হিসাব সমান

                </span>

            `;

        }


        const phoneHTML =
            customer.phone
            ? `

                <div class="customer-phone">

                    ${escapeHTML(
                        customer.phone
                    )}

                </div>

              `
            : `

                <div class="customer-phone empty-phone">

                    মোবাইল নম্বর দেওয়া নেই

                </div>

              `;


        list.innerHTML += `

            <div
                class="customer"
                onclick="openProfileById(
                    '${customer.id || ""}',
                    ${JSON.stringify(name)}
                )"
            >

                <div class="customer-top">


                    <div>

                        <div class="customer-name">

                            ${escapeHTML(name)}

                        </div>


                        ${phoneHTML}


                        <div class="small">

                            ${customerTransactions.length}
                            টি লেনদেন

                        </div>

                    </div>


                    <div class="customer-balance">

                        ${balanceHTML}

                    </div>


                </div>

            </div>

        `;

    });

}


/* ==================================================
   OPEN CUSTOMER PROFILE
================================================== */

function openProfileById(
    customerId,
    customerName
){

    currentCustomerId =
        customerId || null;


    currentCustomer =
        customerName;


    document
        .getElementById("customerPage")
        .classList.add("hidden");


    document
        .getElementById("addPage")
        .classList.add("hidden");


    document
        .getElementById("profilePage")
        .classList.remove("hidden");


    document
        .getElementById("profileName")
        .innerText =
        customerName;


    const customer =
        customers.find(
            c =>
            String(c.id) ===
            String(customerId)
        );


    const phoneElement =
        document.getElementById(
            "profilePhone"
        );


    if(customer && customer.phone){

        phoneElement.innerText =
            customer.phone;

    }else{

        phoneElement.innerText =
            "মোবাইল নম্বর দেওয়া নেই";

    }


    /*
       Clear filters
    */

    const search =
        document.getElementById(
            "transactionSearch"
        );

    const dateFrom =
        document.getElementById(
            "dateFrom"
        );

    const dateTo =
        document.getElementById(
            "dateTo"
        );


    if(search){

        search.value = "";

    }


    if(dateFrom){

        dateFrom.value = "";

    }


    if(dateTo){

        dateTo.value = "";

    }


    renderProfile();

}


/* ==================================================
   OLD FUNCTION SUPPORT
================================================== */

function openProfile(name){

    const customer =
        findCustomerByName(name);


    if(customer){

        openProfileById(
            customer.id,
            customer.name
        );

    }else{

        openProfileById(
            "",
            name
        );

    }

}


/* ==================================================
   SHOW EDIT CUSTOMER
================================================== */

function showEditCustomer(){

    if(!currentCustomer){

        alert(
            "Customer নির্বাচন করা হয়নি।"
        );

        return;

    }


    const customer =
        customers.find(
            c =>
            String(c.id) ===
            String(currentCustomerId)
        );


    /*
       If customer doesn't have
       a database ID, try finding by name
    */

    const selected =
        customer ||
        findCustomerByName(
            currentCustomer
        );


    if(!selected){

        alert(
            "Customer পাওয়া যায়নি।"
        );

        return;

    }


    currentCustomerId =
        selected.id;


    document
        .getElementById(
            "editCustomerName"
        )
        .value =
        selected.name || "";


    document
        .getElementById(
            "editCustomerPhone"
        )
        .value =
        selected.phone || "";


    clearMessage(
        "customerEditMessage"
    );


    document
        .getElementById(
            "editCustomerModal"
        )
        .classList
        .remove("hidden");

}


/* ==================================================
   CLOSE EDIT CUSTOMER
================================================== */

function closeEditCustomer(){

    document
        .getElementById(
            "editCustomerModal"
        )
        .classList
        .add("hidden");


    clearMessage(
        "customerEditMessage"
    );

}


/* ==================================================
   SAVE CUSTOMER EDIT
================================================== */

async function saveCustomerEdit(){

    if(!currentCustomerId){

        showMessage(
            "customerEditMessage",
            "Customer ID পাওয়া যায়নি।",
            false
        );

        return;

    }


    const newName =
        document
        .getElementById(
            "editCustomerName"
        )
        .value
        .trim();


    const newPhone =
        document
        .getElementById(
            "editCustomerPhone"
        )
        .value
        .trim();


    if(!newName){

        showMessage(
            "customerEditMessage",
            "Customer-এর নাম দিন।",
            false
        );

        return;

    }


    /*
       Check duplicate name
    */

    const duplicate =
        customers.find(
            c =>
            c.id !== currentCustomerId &&
            c.name.trim().toLowerCase() ===
            newName.toLowerCase()
        );


    if(duplicate){

        showMessage(
            "customerEditMessage",
            "এই নামে আরেকটি Customer আছে।",
            false
        );

        return;

    }


    /*
       Update customer
    */

    const {
        error
    } = await supabaseClient
        .from("customers")
        .update({

            name:newName,

            phone:newPhone,

            updated_at:new Date()
                .toISOString()

        })
        .eq(
            "id",
            currentCustomerId
        );


    if(error){

        console.error(error);


        showMessage(
            "customerEditMessage",
            "Customer update হয়নি: " +
            error.message,
            false
        );

        return;

    }


    /*
       Existing transactions-এর
       customer_name update করা
    */

    const {
        error:
        transactionError
    } =
        await supabaseClient
        .from("transactions")
        .update({

            customer_name:newName

        })
        .eq(
            "customer_id",
            currentCustomerId
        );


    if(transactionError){

        console.warn(
            "Transaction name update warning:",
            transactionError
        );

    }


    /*
       Update local values
    */

    const oldName =
        currentCustomer;


    currentCustomer =
        newName;


    const selected =
        customers.find(
            c =>
            c.id === currentCustomerId
        );


    if(selected){

        selected.name =
            newName;

        selected.phone =
            newPhone;

    }


    closeEditCustomer();


    /*
       Reload everything
    */

    await loadCustomers();

    await loadTransactions();


    /*
       Open updated profile
    */

    openProfileById(
        currentCustomerId,
        newName
    );

}


/* ==================================================
   DELETE CUSTOMER
================================================== */

async function deleteCustomer(){

    if(!currentCustomerId){

        alert(
            "Customer ID পাওয়া যায়নি।"
        );

        return;

    }


    const customer =
        customers.find(
            c =>
            String(c.id) ===
            String(currentCustomerId)
        );


    const name =
        customer
        ? customer.name
        : currentCustomer;


    const transactionCount =
        transactions.filter(
            t =>
            t.customer_name ===
            name
        ).length;


    let confirmText =
        "Customer '" +
        name +
        "' delete করতে চান?";


    if(transactionCount > 0){

        confirmText +=
            "\n\nএই Customer-এর " +
            transactionCount +
            " টি transaction-ও delete হবে।";

    }


    confirmText +=
        "\n\nএই কাজটি undo করা যাবে না।";


    if(!confirm(confirmText)){

        return;

    }


    /*
       Delete customer
       Foreign key ON DELETE CASCADE
       থাকায় transactions-ও delete হবে
    */

    const {
        error
    } =
        await supabaseClient
        .from("customers")
        .delete()
        .eq(
            "id",
            currentCustomerId
        );


    if(error){

        alert(
            "Customer delete হয়নি:\n" +
            error.message
        );

        return;

    }


    /*
       Local reset
    */

    currentCustomer =
        null;

    currentCustomerId =
        null;


    customers = [];


    /*
       Reload
    */

    await loadCustomers();

    await loadTransactions();


    showCustomers();


    alert(
        "Customer সফলভাবে delete হয়েছে।"
    );

}


/* ==================================================
   ADD / GET CUSTOMER
================================================== */

async function getOrCreateCustomer(
    name,
    phone = ""
){

    const cleanName =
        name.trim();


    if(!cleanName){

        return null;

    }


    /*
       First check existing customer
    */

    let customer =
        customers.find(
            c =>
            c.name.trim().toLowerCase() ===
            cleanName.toLowerCase()
        );


    if(customer){

        /*
           Phone দেওয়া থাকলে
           missing phone update করি
        */

        if(
            phone &&
            !customer.phone
        ){

            const {
                error
            } =
                await supabaseClient
                .from("customers")
                .update({

                    phone:phone,

                    updated_at:
                    new Date()
                    .toISOString()

                })
                .eq(
                    "id",
                    customer.id
                );


            if(!error){

                customer.phone =
                    phone;

            }

        }


        return customer;

    }


    /*
       Create new customer
    */

    const {
        data:{
            user
        }
    } =
        await supabaseClient
        .auth
        .getUser();


    if(!user){

        return null;

    }


    const {
        data,
        error
    } =
        await supabaseClient
        .from("customers")
        .insert({

            user_id:user.id,

            name:cleanName,

            phone:phone || ""

        })
        .select()
        .single();


    if(error){

        /*
           Duplicate হলে আবার fetch
        */

        console.warn(
            "Customer create error:",
            error
        );


        const {
            data:existing
        } =
            await supabaseClient
            .from("customers")
            .select("*")
            .eq(
                "name",
                cleanName
            )
            .maybeSingle();


        if(existing){

            return existing;

        }


        return null;

    }


    customers.push(data);


    return data;

}


/* ==================================================
   MONEY FORMAT
================================================== */

function formatMoney(amount){

    return Number(amount)
        .toLocaleString("en-US");

}


/* ==================================================
   CLOSE MODAL WHEN CLICKING OUTSIDE
================================================== */

document.addEventListener(
    "click",
    function(event){

        const modal =
            document.getElementById(
                "editCustomerModal"
            );


        if(
            event.target === modal
        ){

            closeEditCustomer();

        }

    }
);
